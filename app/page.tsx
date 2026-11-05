export default function Page() {
  return (
    <main className="mx-auto w-full max-w-md space-y-6 p-8">
      <h1 className="text-ink text-[28px] leading-[34px] font-semibold">
        Type check
      </h1>
      <div className="border-line bg-surface rounded-2xl border p-6">
        <p className="text-ink-2 text-sm">Tabular, slashed zero</p>
        <p className="text-ink text-right text-[40px] leading-[44px] font-semibold">
          109.920 g
        </p>
        <p className="text-ink text-right text-[40px] leading-[44px] font-semibold">
          103.004 g
        </p>
        <p className="text-ink text-right text-[40px] leading-[44px] font-semibold">
          {" "}
          3.023 g
        </p>
      </div>
      <div className="flex gap-2">
        <span className="bg-gold-wash text-gold-ink rounded-full px-3 py-1">
          gold
        </span>
        <span className="bg-alert-red-wash text-alert-red rounded-full px-3 py-1">
          red
        </span>
        <span className="bg-alert-amber-wash text-alert-amber rounded-full px-3 py-1">
          amber
        </span>
      </div>
    </main>
  );
}
