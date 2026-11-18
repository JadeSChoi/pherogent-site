import { useEffect, useState, type ReactNode } from "react";
import { readUsageStatus, type UsageModel } from "./usageStatus";
import "./usage.css";

/**
 * The usage meter (issue #13): one ledger page over /api/agent/status.
 * Reported usage, remaining allowances, and reservations are separate
 * ruled groups — a reservation is a hold, never presented as a charge —
 * and any figure the server did not confirm renders as its own labeled
 * unknown, never as a zero. There is no illustrative mode: every figure
 * on this page is the server's.
 */

const countText = (value: number | null): string | null =>
  value === null ? null : value.toLocaleString("en-US");

const usdText = (value: number | null, digits = 2): string | null =>
  value === null
    ? null
    : `$${value.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}`;

/** "left of total" reads only when both sides are confirmed. */
const ofText = (left: string | null, total: string | null): string | null =>
  left !== null && total !== null ? `${left} of ${total}` : null;

/** The incomplete-usage caution; null only when completeness is confirmed. */
const unknownRunsCaution = (unknownCalls: number | null): string | null => {
  if (unknownCalls === null)
    return "The server could not confirm that every run reported its usage. The totals above may understate what was billed.";
  if (unknownCalls === 0) return null;
  const runs = unknownCalls === 1 ? "1 run" : `${unknownCalls} runs`;
  const them = unknownCalls === 1 ? "it" : "them";
  return `${runs} never reported ${unknownCalls === 1 ? "its" : "their"} usage. The totals above exclude ${them} and may understate what was billed.`;
};

function Row({ label, value, unknownAs }: { label: string; value: string | null; unknownAs: string }) {
  return (
    <div className="usage-row">
      <dt>{label}</dt>
      {value === null ? (
        <dd className="usage-unknown">{unknownAs}</dd>
      ) : (
        <dd>{value}</dd>
      )}
    </div>
  );
}

function Group({
  title,
  note,
  caution,
  children,
}: {
  title: string;
  note: ReactNode;
  caution?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="usage-group" role="group" aria-label={title}>
      <h2>{title}</h2>
      <dl className="usage-rows">{children}</dl>
      {caution && <p className="usage-caution">{caution}</p>}
      <p className="usage-group-note">{note}</p>
    </section>
  );
}

type UsageMeterPanelProps = { fetchImpl?: typeof fetch };

export function UsageMeterPanel({ fetchImpl }: UsageMeterPanelProps = {}) {
  const [model, setModel] = useState<UsageModel | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readUsageStatus(fetchImpl ? { fetchImpl } : {})
      .then((next) => {
        if (!cancelled) setModel(next);
      })
      .catch(() => {
        if (!cancelled) setUnreachable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  return (
    <section className="usage-page">
      <header className="usage-head">
        <h1>Usage</h1>
        {unreachable ? (
          <p className="usage-status" role="alert">
            The usage ledger could not be reached. Nothing below is known —
            no figure is shown in its place. Reload to try again.
          </p>
        ) : (
          <p className="usage-status" role="status">
            {model
              ? model.message || "The server reported no status message."
              : "Reading the ledger…"}
          </p>
        )}
      </header>
      {model && (
        <>
          <Group
            title="Reported usage"
            caution={
              // A fully absent ledger already reads as unconfirmed in the note.
              model.reported.unknown
                ? null
                : unknownRunsCaution(model.reported.unknownCalls)
            }
            note={
              model.reported.unknown ? (
                <>
                  This deployment has not reported your usage, so it is shown
                  as unconfirmed — not as zero.
                </>
              ) : (
                <>
                  What the provider reported for your runs on this device.
                  Estimated cost applies the configured rates to reported
                  tokens; it is not an invoice.
                </>
              )
            }
          >
            <Row
              label="Tokens, total"
              value={countText(model.reported.totalTokens)}
              unknownAs="Not reported"
            />
            <Row
              label="Tokens in"
              value={countText(model.reported.inputTokens)}
              unknownAs="Not reported"
            />
            <Row
              label="Tokens out"
              value={countText(model.reported.outputTokens)}
              unknownAs="Not reported"
            />
            <Row
              label="Model calls"
              value={countText(model.reported.modelCalls)}
              unknownAs="Not reported"
            />
            <Row
              label="Estimated model cost"
              value={usdText(model.reported.estimatedCostUsd, 4)}
              unknownAs="Not reported"
            />
          </Group>
          <Group
            title="Remaining allowance"
            note={
              <>
                Allowances are shared by everyone on this deployment and do
                not refill automatically; the daily allowance resets at
                midnight UTC.
              </>
            }
          >
            <Row
              label="Dollars left today"
              value={ofText(
                usdText(model.allowance.remainingDailyUsd),
                usdText(model.allowance.dailyUsd),
              )}
              unknownAs="Unconfirmed"
            />
            <Row
              label="Dollars left, lifetime"
              value={ofText(
                usdText(model.allowance.remainingLifetimeUsd),
                usdText(model.allowance.lifetimeUsd),
              )}
              unknownAs="Unconfirmed"
            />
            <Row
              label="Tokens left to reserve"
              value={ofText(
                countText(model.allowance.remainingLifetimeTokens),
                countText(model.allowance.lifetimeTokens),
              )}
              unknownAs="Unconfirmed"
            />
            <Row
              label="Your runs left today"
              value={ofText(
                countText(model.allowance.userRunsRemaining),
                countText(model.allowance.userRunsPerDay),
              )}
              unknownAs="Unconfirmed"
            />
          </Group>
          <Group
            title="Reservations held"
            note={
              <>
                Reservations are holds against the allowance, not charges.
                Each accepted run reserves{" "}
                {countText(model.reservations.perRunTokens) ?? "a set number of"}{" "}
                tokens and {usdText(model.reservations.perRunUsd) ?? "a set amount"}{" "}
                before it starts, and a failed or stopped run&rsquo;s hold stays
                consumed. What runs actually reported appears above, separately.
              </>
            }
          >
            <Row
              label="Held today, site-wide"
              value={usdText(model.reservations.dailyReservedUsd)}
              unknownAs="Unconfirmed"
            />
            <Row
              label="Held lifetime, site-wide"
              value={usdText(model.reservations.lifetimeReservedUsd)}
              unknownAs="Unconfirmed"
            />
            <Row
              label="Tokens held, lifetime"
              value={
                countText(model.reservations.lifetimeReservedTokens) === null
                  ? null
                  : `${countText(model.reservations.lifetimeReservedTokens)} tokens`
              }
              unknownAs="Unconfirmed"
            />
          </Group>
          <p className="usage-foot">
            {model.pricesVerifiedOn
              ? `Prices behind the estimates last verified ${model.pricesVerifiedOn}.`
              : "The server did not report when its prices were last verified."}{" "}
            This page only displays what the server reports; it cannot start a
            run or raise a limit.
          </p>
        </>
      )}
    </section>
  );
}
