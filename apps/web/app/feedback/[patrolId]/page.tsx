"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Lock, QrCode, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { AppVersion } from "@/components/app-version";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OfflineIndicator } from "@/components/station/offline-indicator";
import { RaceNotStarted } from "@/components/station/race-not-started";
import { useFeedbackLogin, useFeedbackMe, useTakeoverFeedback } from "@/lib/queries/feedback";
import { qk } from "@/lib/queries/keys";
import { ApiError, tokens } from "@/lib/api/client";
import type { FeedbackMePayload } from "@/lib/api/feedback";
import { useIsOffline } from "@/lib/offline/online";
import { useOfflineMutation, useOutboxStatus } from "@/lib/offline/hooks";
import { resumeBlocked } from "@/lib/offline/outbox";
import {
  feedbackChainKey,
  type FeedbackDraftOutboxPayload,
  type FeedbackSubmitOutboxPayload,
} from "@/lib/offline/register";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PinExchangeState = "idle" | "pending" | "success" | "error";

const DEVICE_ID_KEY = "ss.feedback_device_id";
const WINDOW_HOURS = 12;

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export default function FeedbackPage() {
  const params = useParams<{ patrolId: string }>();
  const search = useSearchParams();
  const qc = useQueryClient();

  const patrolId = decodeURIComponent(params.patrolId);
  const pinFromUrl = search.get("pin");
  const deviceId = useMemo(getDeviceId, []);
  const isOffline = useIsOffline();

  const { mutateAsync: loginFeedback } = useFeedbackLogin();
  const [loginToken, setLoginToken] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<unknown>(null);
  const [pinExchangeState, setPinExchangeState] = useState<PinExchangeState>("idle");
  const loginAttemptedForPin = useRef<string | null>(null);

  useEffect(() => {
    const attemptKey = pinFromUrl ? `${patrolId}:${pinFromUrl}` : null;
    if (!pinFromUrl || !attemptKey || loginToken || loginAttemptedForPin.current === attemptKey) return;

    loginAttemptedForPin.current = attemptKey;
    setLoginError(null);
    setPinExchangeState("pending");

    loginFeedback({ patrolId, pin: pinFromUrl })
      .then((res) => {
        if (loginAttemptedForPin.current !== attemptKey) return;
        tokens.set("feedback", res.token);
        qc.invalidateQueries({ queryKey: qk.feedbackScope(patrolId) });
        setLoginToken(res.token);
        setPinExchangeState("success");
      })
      .catch((err) => {
        if (loginAttemptedForPin.current !== attemptKey) return;
        setLoginError(err);
        setPinExchangeState("error");
      });
  }, [pinFromUrl, loginToken, patrolId, loginFeedback, qc]);

  const hasStoredToken = !pinFromUrl && Boolean(tokens.get("feedback"));
  const hasToken = Boolean(loginToken || hasStoredToken);
  const exchangingPin = pinExchangeState === "pending";

  const {
    data: mePayload,
    error: meError,
    isLoading: meLoading,
    refetch: refetchMe,
  } = useFeedbackMe(patrolId, loginToken ?? undefined, hasToken && !loginError);

  const outbox = useOutboxStatus(feedbackChainKey(patrolId));
  const draftMutation = useOfflineMutation<FeedbackDraftOutboxPayload>("feedback.draft");
  const submitMutation = useOfflineMutation<FeedbackSubmitOutboxPayload>("feedback.submit");
  const takeover = useTakeoverFeedback(patrolId);

  const payload = mePayload;
  const notStarted = getNotStartedInfo(loginError) ?? getNotStartedInfo(meError);

  if (notStarted && !payload) {
    return (
      <RaceNotStarted
        raceName={notStarted.raceName}
        stationName={notStarted.patrolName}
        entityLabel="Hlídka"
        onRetry={async () => {
          if (pinFromUrl) {
            loginAttemptedForPin.current = null;
            setLoginError(null);
          } else {
            await refetchMe();
          }
        }}
      />
    );
  }

  if (exchangingPin || (hasToken && !loginError && meLoading)) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!payload) {
    const err = loginError ?? meError;
    const offlineFirstLogin = Boolean(err) && !(err instanceof ApiError);
    const message = err
      ? offlineFirstLogin
        ? "Pro první otevření zpětné vazby je potřeba připojení k síti."
        : err instanceof ApiError && err.status === 403
        ? "Zpětná vazba není pro tento závod zapnutá."
        : err instanceof ApiError && err.status === 423
        ? "Čas na vyplnění zpětné vazby už vypršel."
        : "PIN je neplatný nebo přístup vypršel. Naskenuj QR kód znovu."
      : "Chybí PIN ze QR kódu. Naskenuj kartu hlídky znovu.";

    return (
      <div className="grid min-h-screen place-items-center px-6">
        <EmptyState
          className="max-w-md"
          icon={offlineFirstLogin ? <WifiOff className="h-6 w-6" /> : <QrCode className="h-6 w-6" />}
          title={offlineFirstLogin ? "Bez připojení" : "Přístup se nezdařil"}
          description={message}
        />
      </div>
    );
  }

  return (
    <FeedbackForm
      patrolId={patrolId}
      deviceId={deviceId}
      payload={payload}
      isOffline={isOffline}
      outboxBlocked={outbox.blockedCount > 0}
      pendingCount={outbox.pendingCount}
      onDraft={(positives, negatives) =>
        draftMutation.mutateAsync({ patrolId, positives, negatives, device_id: deviceId })
      }
      onSubmit={() => submitMutation.mutateAsync({ patrolId, device_id: deviceId })}
      onTakeover={async () => {
        await takeover.mutateAsync(deviceId);
        await resumeBlocked(feedbackChainKey(patrolId));
      }}
      onRefetch={() => void refetchMe()}
    />
  );
}

function FeedbackForm({
  patrolId,
  deviceId,
  payload,
  isOffline,
  outboxBlocked,
  pendingCount,
  onDraft,
  onSubmit,
  onTakeover,
  onRefetch,
}: {
  patrolId: string;
  deviceId: string;
  payload: FeedbackMePayload;
  isOffline: boolean;
  outboxBlocked: boolean;
  pendingCount: number;
  onDraft: (positives: string[], negatives: string[]) => Promise<void>;
  onSubmit: () => Promise<void>;
  onTakeover: () => Promise<void>;
  onRefetch: () => void;
}) {
  const { patrol, race, config, feedback } = payload;
  const positiveCount = config.positive_count;
  const negativeCount = config.negative_count;

  const [positives, setPositives] = useState<string[]>(() =>
    seedFields(feedback?.positives, positiveCount)
  );
  const [negatives, setNegatives] = useState<string[]>(() =>
    seedFields(feedback?.negatives, negativeCount)
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submitted = feedback?.state === "submitted";
  // Lock drží jiné zařízení (nebo prohlížeč) — formulář read-only s převzetím.
  const lockedByOther =
    !submitted &&
    Boolean(feedback?.lock_device) &&
    feedback?.lock_device !== deviceId;
  // 409 z flushe outboxu — konflikt se nesmí tiše zahodit.
  const conflict = outboxBlocked;

  const readOnly = submitted || lockedByOther || !payload.window_open;

  const positivesRef = useRef(positives);
  positivesRef.current = positives;
  const negativesRef = useRef(negatives);
  negativesRef.current = negatives;

  const flushDraft = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaving(true);
    try {
      await onDraft(positivesRef.current, negativesRef.current);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }, [onDraft]);

  const scheduleAutosave = useCallback(() => {
    dirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Debounce 5 s po posledním úhozu.
    debounceRef.current = setTimeout(() => void flushDraft(), 5_000);
  }, [flushDraft]);

  useEffect(() => {
    // Zavření prohlížeče na mobilu je běžný způsob odchodu — uložit hned.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flushDraft();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [flushDraft]);

  function setPositive(index: number, value: string) {
    setPositives((prev) => prev.map((v, i) => (i === index ? value : v)));
    scheduleAutosave();
  }

  function setNegative(index: number, value: string) {
    setNegatives((prev) => prev.map((v, i) => (i === index ? value : v)));
    scheduleAutosave();
  }

  const emptyFields = [
    ...positives.map((v, i) => (v.trim() === "" ? `Co se povedlo #${i + 1}` : null)),
    ...negatives.map((v, i) => (v.trim() === "" ? `Prostor pro zlepšení #${i + 1}` : null)),
  ].filter((x): x is string => x !== null);

  async function doSubmit() {
    setSubmitting(true);
    try {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      dirtyRef.current = true;
      await flushDraft();
      await onSubmit();
      setConfirmOpen(false);
      toast.success("Zpětná vazba odeslána. Děkujeme!");
      onRefetch();
    } catch {
      toast.error("Odeslání selhalo. Zkus to znovu.");
    } finally {
      setSubmitting(false);
    }
  }

  const windowInfo = windowRemaining(race.state, race.closed_at, feedback?.reopened_at ?? null);

  const saveStatus = saving
    ? "Ukládám…"
    : pendingCount > 0
      ? "Uloženo offline — odešle se automaticky"
      : savedAt
        ? `Uloženo ${savedAt.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`
        : null;

  return (
    <div className="flex min-h-screen flex-col bg-scout-bg-app text-scout-text">
      <header className="shrink-0 bg-scout-blue text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-11 text-white/50">Zpětná vazba — {race.name ?? "závod"}</div>
            <div className="truncate text-20 font-bold leading-tight">
              #{patrol.start_number} {patrol.name}
            </div>
          </div>
          <OfflineIndicator chainKeyPrefix={feedbackChainKey(patrolId)} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        {submitted ? (
          <div className="mb-4 flex items-center gap-2 rounded-12 border border-scout-green-border bg-scout-green-soft p-4 text-14">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-scout-green" />
            <span>
              Odesláno{" "}
              {feedback?.submitted_at
                ? new Date(feedback.submitted_at).toLocaleString("cs-CZ")
                : ""}
              . Text už nejde upravovat.
            </span>
          </div>
        ) : null}

        {lockedByOther || conflict ? (
          <div className="mb-4 rounded-12 border border-scout-yellow-border bg-scout-yellow-soft p-4 text-13">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Lock className="h-4 w-4" />
              Formulář už vyplňuje jiné zařízení nebo prohlížeč
              {feedback?.lock_at
                ? ` (od ${new Date(feedback.lock_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })})`
                : ""}
            </div>
            <p className="mb-3 text-scout-text-muted">
              Převzetím začneš vyplňovat tady — druhé zařízení se přepne do čtení.
            </p>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await onTakeover();
                  toast.success("Vyplňování převzato.");
                } catch {
                  toast.error("Převzetí selhalo.");
                }
              }}
            >
              Převzít vyplňování
            </Button>
          </div>
        ) : null}

        {!payload.window_open && !submitted ? (
          <div className="mb-4 rounded-12 border border-scout-border bg-white p-4 text-13 text-scout-text-muted">
            Čas na vyplnění zpětné vazby vypršel.
          </div>
        ) : null}

        <FieldGroup
          label="Co se povedlo"
          values={positives}
          readOnly={readOnly}
          onChange={setPositive}
        />
        <FieldGroup
          label="Prostor pro zlepšení"
          values={negatives}
          readOnly={readOnly}
          onChange={setNegative}
        />

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-scout-border pt-4">
          <div className="min-w-0 text-12 text-scout-text-muted">
            {saveStatus ? <div>{saveStatus}</div> : null}
            {windowInfo && !submitted ? <div>{windowInfo}</div> : null}
          </div>
          {!submitted ? (
            <Button
              variant="accent"
              size="lg"
              disabled={readOnly || submitting}
              onClick={() => setConfirmOpen(true)}
            >
              Uzavřít a odeslat
            </Button>
          ) : null}
        </div>

        {isOffline ? (
          <p className="mt-3 text-12 text-scout-text-muted">
            Jsi offline — vše se ukládá do zařízení a odešle se automaticky.
          </p>
        ) : null}

        <div className="mt-8 text-center">
          <AppVersion />
        </div>
      </main>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uzavřít a odeslat?</DialogTitle>
            <DialogDescription>
              Po odeslání už nepůjde text upravovat.
              {emptyFields.length > 0 ? (
                <>
                  {" "}
                  {emptyFields.length === 1
                    ? `1 pole zůstalo nevyplněné (${emptyFields[0]}).`
                    : `${emptyFields.length} pole zůstala nevyplněná (${emptyFields.join(", ")}).`}{" "}
                  Opravdu odeslat?
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Ještě upravit
            </Button>
            <Button variant="accent" onClick={doSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Odeslat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldGroup({
  label,
  values,
  readOnly,
  onChange,
}: {
  label: string;
  values: string[];
  readOnly: boolean;
  onChange: (index: number, value: string) => void;
}) {
  if (values.length === 0) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-15 font-bold">{label}</h2>
      <div className="space-y-3">
        {values.map((value, index) => (
          <div key={index} className="space-y-1">
            <Label htmlFor={`${label}-${index}`} className="text-12 text-scout-text-muted">
              {label} #{index + 1}
            </Label>
            <Textarea
              id={`${label}-${index}`}
              value={value}
              disabled={readOnly}
              onChange={(e) => onChange(index, e.target.value)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function seedFields(saved: string[] | undefined, count: number): string[] {
  return Array.from({ length: count }, (_, i) => saved?.[i] ?? "");
}

function windowRemaining(state: string, closedAt?: string | null, reopenedAt?: string | null) {
  if (state !== "closed") return null;
  const base = [closedAt, reopenedAt]
    .map((v) => (v ? new Date(v).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  if (base.length === 0) return null;
  const deadline = Math.max(...base) + WINDOW_HOURS * 60 * 60 * 1000;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `Formulář jde uzavřít ještě ${hours} h ${minutes} min`;
}

function getNotStartedInfo(err: unknown): { raceName?: string; patrolName?: string } | null {
  if (
    err instanceof ApiError &&
    err.status === 409 &&
    typeof err.body === "object" &&
    err.body !== null &&
    (err.body as { error?: string }).error === "race_not_started"
  ) {
    const body = err.body as { race_name?: string; patrol_name?: string };
    return { raceName: body.race_name, patrolName: body.patrol_name };
  }
  return null;
}
