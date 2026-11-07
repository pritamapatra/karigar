"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ReviewState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "uncertain"; message: string }
  | { status: "error"; message: string };

export function AlertReviewButton({
  alertId,
  disabled,
  onLockChange,
  onSuccess,
}: {
  alertId: string;
  disabled: boolean;
  onLockChange: (locked: boolean) => void;
  onSuccess: () => void;
}) {
  const [state, setState] = useState<ReviewState>({ status: "idle" });
  const sending = useRef(false);

  async function review() {
    if (sending.current || (disabled && state.status !== "uncertain")) {
      return;
    }

    sending.current = true;
    setState({ status: "sending" });
    onLockChange(true);

    let succeeded = false;

    try {
      const response = await fetch(
        `/api/alerts/${encodeURIComponent(alertId)}/review`,
        { method: "POST", cache: "no-store" },
      );

      if (response.ok) {
        const body = await response.json();
        if (body?.id !== alertId || body?.status !== "reviewed") {
          throw new Error("Unexpected review response");
        }
        succeeded = true;
      } else if (response.status >= 400 && response.status < 500) {
        const body = await response.json().catch(() => null);
        setState({
          status: "error",
          message:
            typeof body?.error === "string"
              ? body.error
              : "The review request was rejected. Try refreshing the page.",
        });
        onLockChange(false);
      } else {
        throw new Error("Review response was not successful");
      }
    } catch {
      setState({
        status: "uncertain",
        message:
          "We could not confirm whether this alert was marked reviewed. Retry this action to confirm its status. Filters and other review actions remain paused.",
      });
    } finally {
      sending.current = false;
    }

    if (succeeded) {
      setState({ status: "idle" });
      onSuccess();
      onLockChange(false);
    }
  }

  const unresolved = state.status === "sending" || state.status === "uncertain";

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="min-h-12"
        disabled={
          state.status === "sending" ||
          (disabled && state.status !== "uncertain")
        }
        aria-label={
          state.status === "uncertain"
            ? "Retry marking this alert reviewed"
            : "Mark this alert reviewed"
        }
        onClick={() => void review()}
      >
        {state.status === "sending"
          ? "Marking reviewed…"
          : state.status === "uncertain"
            ? "Retry review"
            : "Mark reviewed"}
      </Button>
      {state.status === "sending" && (
        <p role="status" className="text-sm">
          Confirming review…
        </p>
      )}
      {(state.status === "error" || state.status === "uncertain") && (
        <p role="alert" className="max-w-prose text-sm">
          {state.message}
        </p>
      )}
      {unresolved && (
        <p className="text-sm">
          Retrying only marks this same alert reviewed; it does not post a
          ledger entry.
        </p>
      )}
    </div>
  );
}
