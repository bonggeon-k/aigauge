import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AuthMethod, ProviderDescriptor } from "@/hooks/useProvider";
import { ProviderSetup } from "@/components/providers/ProviderSetup";

interface WelcomeFlowProps {
  providers: ProviderDescriptor[];
  onComplete: () => void;
  onSkip: () => void;
}

const stepVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

export const WelcomeFlow = ({ providers, onComplete, onSkip }: WelcomeFlowProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [setupIndex, setSetupIndex] = useState(0);

  const currentProvider = selected[setupIndex] ?? null;
  const currentAuth = useMemo<AuthMethod>(() => {
    if (!currentProvider) return "api_key";
    return providers.find((provider) => provider.id === currentProvider)?.auth_method ?? "api_key";
  }, [currentProvider, providers]);
  const setupCompleted = selected.length > 0 && setupIndex >= selected.length;

  const goToSetupStep = () => {
    setSetupIndex(0);
    setStep(2);
  };

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
              <h1 className="text-2xl font-semibold">{t("onboarding.welcomeTitle")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("onboarding.welcomeDesc")}
              </p>
              <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-4 text-sm text-muted-foreground">
                {t("onboarding.firstRunBehavior")}
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="text-xl font-semibold">{t("onboarding.chooseTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("onboarding.chooseDesc")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {providers.map((provider) => {
                  const checked = selected.includes(provider.id);
                  return (
                    <label key={provider.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.currentTarget.checked) {
                            setSelected((prev) => [...prev, provider.id]);
                          } else {
                            setSelected((prev) => prev.filter((item) => item !== provider.id));
                          }
                        }}
                      />
                      {t(`onboarding.providers.${provider.id}`)}
                    </label>
                  );
                })}
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">{t("onboarding.setupTitle")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("onboarding.setupDesc")}
                </p>
                {selected.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("onboarding.setupProgress", {
                      current: Math.min(setupIndex + 1, selected.length),
                      total: selected.length,
                    })}
                  </p>
                ) : null}
              </div>
              {currentProvider ? (
                <ProviderSetup
                  embedded
                  open
                  providerId={currentProvider}
                  authMethod={currentAuth}
                  onClose={() => setSetupIndex((prev) => Math.min(prev + 1, selected.length))}
                  onSaved={() => setSetupIndex((prev) => Math.min(prev + 1, selected.length))}
                />
              ) : (
                <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-4 text-sm text-muted-foreground">
                  {selected.length === 0
                    ? t("onboarding.setupNoSelection")
                    : t("onboarding.setupDone")}
                </div>
              )}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h2 className="text-xl font-semibold">{t("onboarding.complete")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("onboarding.completeDesc", { count: selected.length })}
              </p>
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={onSkip} aria-label={t("onboarding.skip")}>
          {t("onboarding.skip")}
        </Button>
        <div className="flex gap-2">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep((prev) => Math.max(0, prev - 1))}>
              {t("onboarding.back")}
            </Button>
          ) : null}
          {step === 0 ? (
            <Button onClick={() => setStep(1)}>{t("onboarding.next")}</Button>
          ) : null}
          {step === 1 ? (
            <Button disabled={selected.length === 0} onClick={goToSetupStep}>
              {t("onboarding.startSetup")}
            </Button>
          ) : null}
          {step === 2 && setupCompleted ? (
            <Button onClick={() => setStep(3)}>{t("onboarding.reviewSetup")}</Button>
          ) : null}
          {step === 3 ? (
            <Button onClick={onComplete}>{t("onboarding.openDashboard")}</Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
