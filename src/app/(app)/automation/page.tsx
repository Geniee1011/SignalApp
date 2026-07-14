"use client";

import { Card, Badge, Button } from "@/components/ui";

/* Automation (X) — design placeholder only for now (per spec: copy the page
 * design, no functionality yet). Real auto-copy/order placement is a later phase
 * and would need write access + a broker path. */

export default function AutomationPage() {
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Automation</h1>
        <Badge tone="warning">Coming soon</Badge>
      </div>

      <Card className="mb-4 p-5">
        <div className="text-sm font-medium">Auto-copy signals</div>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Mirror live signals straight into your own broker automatically — filtered by conviction, market and risk.
          This is a preview of the interface; execution isn&apos;t wired up yet.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Toggle label="Enable auto-copy" />
          <Setting label="Min. conviction" value="2" />
          <Setting label="Max concurrent trades" value="5" />
          <Setting label="Markets" value="ES, NQ, GC, CL" />
          <Setting label="Risk per trade" value="1%" />
          <Setting label="Broker" value="Not connected" />
        </div>
        <div className="mt-5 flex gap-2">
          <Button disabled>Connect broker</Button>
          <Button variant="secondary" disabled>Save settings</Button>
        </div>
      </Card>

      <p className="text-xs text-muted-2">Automation is display-only in this version. We&apos;ll enable live execution in a later release.</p>
    </div>
  );
}

function Toggle({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <span className="h-5 w-9 rounded-full bg-surface-3 p-0.5"><span className="block h-4 w-4 rounded-full bg-muted-2" /></span>
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
