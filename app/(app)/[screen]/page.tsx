import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NAV, type NavId } from "@/lib/nav";

export function generateStaticParams() {
  return Object.keys(NAV).map((screen) => ({ screen }));
}

async function Screen({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  if (!(screen in NAV)) notFound();
  return (
    <h1 className="text-ink text-[28px] leading-[34px] font-semibold">
      {NAV[screen as NavId].label}
    </h1>
  );
}

export default function Page({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <Screen params={params} />
    </Suspense>
  );
}
