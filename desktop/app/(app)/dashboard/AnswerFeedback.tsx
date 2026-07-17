'use client';

import { useState } from 'react';
import { sendFeedback, type AskResult } from '@/lib/brein';
import { useT } from '@/lib/i18n';

type Rating = 'up' | 'down';
type Reason = 'onjuist' | 'verouderd' | 'onvolledig';
type Status = 'idle' | 'sending' | 'sent' | 'error';

const REASONS: Reason[] = ['onjuist', 'verouderd', 'onvolledig'];
const EXCERPT_LENGTH = 300;

function ThumbIcon({ down = false }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      width="14"
      height="14"
      aria-hidden="true"
      style={down ? { transform: 'rotate(180deg)' } : undefined}
    >
      <path
        d="M5 7V13.5H3.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H5Zm0 0 2.7-5.2a1 1 0 0 1 1.83.35l.32 2.35a1 1 0 0 0 .99.85h2.16a1.5 1.5 0 0 1 1.47 1.8l-.9 4.5a1.5 1.5 0 0 1-1.47 1.2H5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AnswerFeedback({
  question,
  answer,
  bronnen,
}: {
  question: string;
  answer: string;
  bronnen: AskResult['bronnen'];
}) {
  const { t } = useT();
  const [rating, setRating] = useState<Rating | null>(null);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const sourceIds = bronnen.map((b) => b.id).filter((id): id is string => Boolean(id));
  const excerpt =
    answer.length > EXCERPT_LENGTH ? `${answer.slice(0, EXCERPT_LENGTH)}…` : answer;

  async function submit(next: Rating, reason?: string) {
    setStatus('sending');
    try {
      await sendFeedback({
        question,
        answerExcerpt: excerpt,
        rating: next,
        reason,
        sourceIds,
      });
      setStatus('sent');
      setPicking(false);
    } catch {
      setStatus('error');
    }
  }

  function handleUp() {
    if (status === 'sending' || status === 'sent') return;
    setRating('up');
    submit('up');
  }

  function handleDown() {
    if (status === 'sending' || status === 'sent') return;
    setRating('down');
    setPicking(true);
  }

  function handleReason(reason: Reason) {
    submit('down', reason);
  }

  function handleNoteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    submit('down', note.trim());
  }

  if (status === 'sent') {
    return <p className="answer-feedback__thanks">{t('feedback.thanks')}</p>;
  }

  return (
    <div className="answer-feedback">
      <div className="answer-feedback__thumbs">
        <button
          type="button"
          className="answer-feedback__thumb"
          data-active={rating === 'up'}
          onClick={handleUp}
          aria-pressed={rating === 'up'}
          aria-label={t('feedback.up')}
        >
          <ThumbIcon />
        </button>
        <button
          type="button"
          className="answer-feedback__thumb"
          data-active={rating === 'down'}
          onClick={handleDown}
          aria-pressed={rating === 'down'}
          aria-label={t('feedback.down')}
        >
          <ThumbIcon down />
        </button>
        {status === 'error' && !picking && (
          <span className="answer-feedback__error">{t('feedback.sendFailed')}</span>
        )}
      </div>

      {picking && (
        <div className="answer-feedback__panel">
          <p className="answer-feedback__prompt">{t('feedback.reasonPrompt')}</p>
          <div className="answer-feedback__reasons">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className="answer-feedback__reason"
                onClick={() => handleReason(r)}
                disabled={status === 'sending'}
              >
                {t(`feedback.reasons.${r}`)}
              </button>
            ))}
          </div>
          <form onSubmit={handleNoteSubmit} className="answer-feedback__note-form">
            <input
              type="text"
              className="answer-feedback__note-input"
              placeholder={t('feedback.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={t('feedback.notePlaceholder')}
            />
            <button
              type="submit"
              className="answer-feedback__note-submit"
              disabled={!note.trim() || status === 'sending'}
            >
              {t('feedback.send')}
            </button>
          </form>
          {status === 'error' && (
            <p className="answer-feedback__error">{t('feedback.sendFailed')}</p>
          )}
        </div>
      )}
    </div>
  );
}
