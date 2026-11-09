"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AiPhotoSheet } from "@/components/ai-photo-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiReading } from "@/lib/ai-reading";
import {
  MAX_PHOTO_BYTES,
  PHOTO_CONTENT_TYPES,
  SCALE_PHOTO_BUCKET,
} from "@/lib/schemas/scale-photo";
import { createClient } from "@/lib/supabase/client";

export type PhotoAttachment = {
  photoId: string;
  aiReadingId?: string;
  reading?: AiReading;
};

type Props = {
  disabled?: boolean;
  typedWeight?: number | null;
  typedPurity?: number | null;
  onUseReading?: (reading: AiReading) => void;
  onChange: (attachment: PhotoAttachment | null) => void;
  onBusyChange: (busy: boolean) => void;
};

async function responseBody(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Request failed (${response.status}). Try again.`,
    );
  }
  if (!body) throw new Error("The server returned an empty response.");
  return body;
}

export function ScalePhotoReader({
  disabled = false,
  typedWeight = null,
  typedPurity = null,
  onUseReading,
  onChange,
  onBusyChange,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<PhotoAttachment | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const inputId = useId();
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function publish(value: PhotoAttachment | null) {
    setAttachment(value);
    onChange(value);
  }

  async function upload(file: File) {
    if (inFlight.current || disabled) return;
    setError(null);
    setMessage(null);

    if (!PHOTO_CONTENT_TYPES.some((contentType) => contentType === file.type)) {
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
      setError("Photo must be non-empty and 5 MB or smaller.");
      return;
    }

    setPreviewUrl(
      typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : null,
    );
    setPreviewFile(file);
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    publish(null);

    try {
      const slot = await responseBody(
        await fetch("/api/scale-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: file.type,
            sizeBytes: file.size,
          }),
        }),
      );

      const { error: uploadError } = await createClient()
        .storage.from(SCALE_PHOTO_BUCKET)
        .uploadToSignedUrl(slot.path, slot.token, file, {
          contentType: file.type,
        });
      if (uploadError) {
        throw new Error(
          "Photo upload failed. Select the photo again to retry.",
        );
      }

      publish({ photoId: slot.photoId });
      setMessage("Photo uploaded. Reading the display…");

      const result = await responseBody(
        await fetch(`/api/scale-photos/${slot.photoId}/read`, {
          method: "POST",
        }),
      );
      if (typeof result.readingId !== "string") {
        throw new Error("The server returned no reading reference.");
      }

      if (result.ok) {
        publish({
          photoId: slot.photoId,
          aiReadingId: result.readingId,
          reading: result.reading,
        });
        setMessage(
          "Check the photo and reading before using suggestions or entering values manually.",
        );
      } else {
        publish({
          photoId: slot.photoId,
          aiReadingId: result.readingId,
        });
        setMessage(
          `AI could not read the photo (${result.reason}). Enter the values manually.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process the photo.");
      setMessage(
        "If the photo uploaded successfully, it remains attached. You can enter values manually.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clear() {
    if (busy || disabled) return;
    publish(null);
    setPreviewFile(null);
    setPreviewUrl(null);
    setReviewOpen(false);
    setMessage(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const reading = attachment?.reading;

  return (
    <section
      aria-label="Scale photo"
      aria-busy={busy}
      className="border-line space-y-3 rounded-xl border p-4"
    >
      <div className="space-y-2">
        <Label htmlFor={inputId}>Scale or karat meter photo</Label>
        <Input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <p className="text-ink-2 text-sm">
          Optional. JPEG, PNG or WebP, up to 5 MB. Keep the display and unit
          visible.
        </p>
      </div>

      {busy && <p role="status">Uploading photo or reading display…</p>}
      {message && <p className="text-sm">{message}</p>}
      {error && (
        <p role="alert" className="text-alert-red text-sm">
          {error}
        </p>
      )}

      {reading && (
        <div className="bg-surface space-y-2 rounded-lg p-3 text-sm">
          <p>AI confidence: {reading.confidence}</p>
          <p>
            Suggested weight:{" "}
            {reading.weight.value === null
              ? "Can't read"
              : `${(reading.weight.value / 1000).toFixed(3)} g`}
          </p>
          <p>
            Suggested purity:{" "}
            {reading.purity.value === null
              ? "Can't read"
              : `${(reading.purity.value / 100).toFixed(2)}%`}
          </p>
          {reading.notes && <p>{reading.notes}</p>}
          <p>AI suggestions are not a substitute for checking the display.</p>
        </div>
      )}

      {previewFile && (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => setReviewOpen(true)}
          >
            Check photo and reading
          </Button>
          <AiPhotoSheet
            open={reviewOpen}
            onOpenChange={setReviewOpen}
            previewUrl={previewUrl}
            reading={reading}
            busy={busy}
            message={message}
            error={error}
            typedWeight={typedWeight}
            typedPurity={typedPurity}
            onUseReading={onUseReading}
          />
        </>
      )}

      {attachment && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={clear}
        >
          Remove photo attachment
        </Button>
      )}
    </section>
  );
}
