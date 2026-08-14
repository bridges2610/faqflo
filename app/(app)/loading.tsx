/*
  Shown while the (app) layout's two awaited DAL queries resolve.

  The layout is `force-dynamic` and blocks on requireUser() + sitesForUser()
  before any child renders, so without this the browser sits on the previous
  page — or on nothing at all, on a cold navigation.

  Mirrors the rhythm of a real screen (title, subtitle, two panels) rather than
  a spinner, and it is the same shape as AppShell's own ShellSkeleton, which
  covers the next frame while the client store loads. The two run back to back,
  so a shape change here that isn't made there produces a visible jump.
*/
export default function DashboardLoading() {
  return (
    <div className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl animate-pulse" aria-hidden="true">
        <div className="bg-line h-8 w-56 rounded-lg" />
        <div className="bg-line/70 mt-3 h-4 w-80 rounded" />
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <div className="border-line h-44 rounded-xl border bg-white" />
          <div className="border-line h-44 rounded-xl border bg-white" />
        </div>
      </div>
      <span className="sr-only" role="status">
        Loading your dashboard
      </span>
    </div>
  );
}
