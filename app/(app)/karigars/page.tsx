import { KarigarList } from "@/components/karigar-list";

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-ink text-[28px] leading-[34px] font-semibold">Karigars</h1>
      <KarigarList />
    </div>
  );
}
