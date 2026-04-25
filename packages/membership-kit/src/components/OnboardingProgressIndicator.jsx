/**
 * A horizontal step progress indicator styled after IBM Carbon's ProgressIndicator.
 * Renders numbered circles connected by lines, with the current step highlighted.
 */
export default function OnboardingProgressIndicator({ steps, currentStep }) {
  return (
    <nav aria-label="Onboarding progress" className="w-full">
      <ol className="flex items-center w-full">
        {steps.map((label, index) => {
          const stepNum = index + 1;
          const isComplete = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;

          return (
            <li key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                {/* Circle */}
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors duration-200
                    ${isComplete ? 'bg-primary text-primary-foreground' : ''}
                    ${isCurrent ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : ''}
                    ${!isComplete && !isCurrent ? 'bg-muted text-muted-foreground border border-border' : ''}
                  `}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isComplete ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    stepNum
                  )}
                </div>
                {/* Label */}
                <span
                  className={`mt-1.5 text-xs font-semibold whitespace-nowrap ${
                    isCurrent ? 'text-primary' : isComplete ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </span>
              </div>

              {/* Connector line between steps */}
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mb-5 transition-colors duration-200 ${
                    isComplete ? 'bg-primary' : 'bg-border'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
