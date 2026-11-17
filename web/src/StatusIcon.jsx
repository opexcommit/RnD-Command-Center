// Status is never colour alone: each one has its own shape and a text label.
const SHAPES = {
  'On track': <circle cx="7" cy="7" r="6" className="f-ok" />,
  'At risk': <path d="M7 1 13.2 12.5H.8Z" className="f-risk" />,
  'Delayed': <path d="M7 .5 13.5 7 7 13.5 .5 7Z" className="f-late" />,
  'On hold': <circle cx="7" cy="7" r="4.5" className="s-hold" strokeWidth="2.5" />,
  'Done': <><rect x="1" y="1" width="12" height="12" rx="3" className="f-done" /><path d="M4 7.2 6.2 9.4 10 5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>
};

export const StatusIcon = ({ status }) =>
  <svg viewBox="0 0 14 14" className="ic" aria-hidden="true">{SHAPES[status] || SHAPES['On hold']}</svg>;

export const StatusPill = ({ status }) => <span className="status"><StatusIcon status={status} />{status}</span>;
