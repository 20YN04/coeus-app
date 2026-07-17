// De "later"-escape uit de onboarding-wizard (stap 2) — de enige localStorage-
// vlag in de hele wizard-flow. Een lege kennisbank blijft de echte trigger
// (zie app/page.tsx); dit voorkomt alleen dat "Later" je meteen terugstuurt.
export const WELKOM_LATER_KEY = 'coeus.welkomLater';
