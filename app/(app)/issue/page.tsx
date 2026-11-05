import { IssueForm } from "@/components/issue-form";

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-ink text-[28px] leading-[34px] font-semibold">
        New Issue
      </h1>
      <IssueForm />
    </div>
  );
}
