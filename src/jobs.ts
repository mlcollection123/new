export interface Job {
  name: string;
  status: "running" | "done" | "failed";
  log: string[];
  startedAt: number;
}

let job: Job | undefined;

export const currentJob = () => job;

// One background job at a time. console.log output during the job is copied into its log.
export function startJob(name: string, fn: () => Promise<unknown>): boolean {
  if (job?.status === "running") return false;
  const j: Job = { name, status: "running", log: [], startedAt: Date.now() };
  job = j;
  const original = console.log;
  const text = (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x));
  console.log = (...a: unknown[]) => {
    j.log.push(a.map(text).join(" "));
    if (j.log.length > 500) j.log.shift();
    original(...a);
  };
  fn()
    .then((r) => {
      if (r !== undefined) j.log.push(text(r));
      j.status = "done";
    })
    .catch((e) => {
      j.log.push("Error: " + (e instanceof Error ? e.message : String(e)));
      j.status = "failed";
    })
    .finally(() => {
      console.log = original;
    });
  return true;
}
