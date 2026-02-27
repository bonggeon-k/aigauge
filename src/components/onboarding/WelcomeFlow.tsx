import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { AuthMethod } from "@/hooks/useProvider";
import { ProviderSetup } from "@/components/providers/ProviderSetup";

interface WelcomeFlowProps {
  providerIds: string[];
  onComplete: (selectedProviders: string[]) => void;
  onSkip: () => void;
}

const stepVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

export const WelcomeFlow = ({ providerIds, onComplete, onSkip }: WelcomeFlowProps) => {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(providerIds.slice(0, 2));
  const [setupIndex, setSetupIndex] = useState(0);

  const currentProvider = selected[setupIndex] ?? null;
  const currentAuth = useMemo<AuthMethod>(() => "api_key", []);

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card/80 p-6 shadow-lg">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          variants={stepVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.24 }}
          className="space-y-4"
        >
          {step === 0 ? (
            <>
              <h1 className="text-2xl font-semibold">Welcome to AIGauge</h1>
              <p className="text-sm text-muted-foreground">
                Track usage, quota, and cost across your AI coding providers with real-time alerts.
              </p>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="text-xl font-semibold">Choose your providers</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {providerIds.map((provider) => {
                  const checked = selected.includes(provider);
                  return (
                    <label key={provider} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.currentTarget.checked) {
                            setSelected((prev) => [...prev, provider]);
                          } else {
                            setSelected((prev) => prev.filter((item) => item !== provider));
                          }
                        }}
                      />
                      {provider}
                    </label>
                  );
                })}
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 className="text-xl font-semibold">Set up credentials</h2>
              <p className="text-sm text-muted-foreground">
                Add credentials for selected providers one by one. You can skip any provider.
              </p>
              {currentProvider ? (
                <ProviderSetup
                  open={true}
                  providerId={currentProvider}
                  authMethod={currentAuth}
                  onClose={() => setSetupIndex((prev) => Math.min(prev + 1, selected.length))}
                  onSaved={() => setSetupIndex((prev) => Math.min(prev + 1, selected.length))}
                />
              ) : (
                <p className="text-sm">All selected providers processed.</p>
              )}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h2 className="text-xl font-semibold">You're all set</h2>
              <p className="text-sm text-muted-foreground">
                {selected.length} providers selected. Open dashboard to start monitoring.
              </p>
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={onSkip} aria-label="Skip onboarding">
          Skip
        </Button>
        <div className="flex gap-2">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep((prev) => Math.max(0, prev - 1))}>
              Back
            </Button>
          ) : null}
          {step < 3 ? (
            <Button onClick={() => setStep((prev) => Math.min(3, prev + 1))}>Next</Button>
          ) : (
            <Button onClick={() => onComplete(selected)}>Open Dashboard</Button>
          )}
        </div>
      </div>
    </div>
  );
};
