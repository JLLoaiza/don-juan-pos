export const tokensCss = `
:root {
  --dj-color-bg: #f5f6f8;
  --dj-color-surface: #ffffff;
  --dj-color-border: #d8dbe0;
  --dj-color-text: #1a1d23;
  --dj-color-text-muted: #5b6270;
  --dj-color-primary: #1f5eff;
  --dj-color-primary-contrast: #ffffff;
  --dj-color-success-bg: #e4f7ec;
  --dj-color-success-text: #0f7a44;
  --dj-color-warning-bg: #fff4e0;
  --dj-color-warning-text: #9a5b00;
  --dj-color-danger-bg: #fdeaea;
  --dj-color-danger-text: #b3261e;
  --dj-color-neutral-bg: #eceef1;
  --dj-color-neutral-text: #495060;

  --dj-space-1: 4px;
  --dj-space-2: 8px;
  --dj-space-3: 12px;
  --dj-space-4: 16px;
  --dj-space-5: 24px;
  --dj-space-6: 32px;

  --dj-radius-sm: 6px;
  --dj-radius-md: 10px;
  --dj-radius-pill: 999px;

  --dj-font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --dj-font-size-sm: 13px;
  --dj-font-size-md: 15px;
  --dj-font-size-lg: 20px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--dj-color-bg);
  color: var(--dj-color-text);
  font-family: var(--dj-font-family);
  font-size: var(--dj-font-size-md);
}

.dj-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--dj-space-2);
  border-radius: var(--dj-radius-md);
  border: 1px solid transparent;
  padding: var(--dj-space-2) var(--dj-space-4);
  font-size: var(--dj-font-size-md);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.dj-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.dj-btn--primary {
  background: var(--dj-color-primary);
  color: var(--dj-color-primary-contrast);
}

.dj-btn--primary:hover:not(:disabled) {
  opacity: 0.9;
}

.dj-btn--secondary {
  background: var(--dj-color-surface);
  color: var(--dj-color-text);
  border-color: var(--dj-color-border);
}

.dj-btn--secondary:hover:not(:disabled) {
  background: var(--dj-color-neutral-bg);
}

.dj-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--dj-space-2);
  border-radius: var(--dj-radius-pill);
  padding: var(--dj-space-1) var(--dj-space-3);
  font-size: var(--dj-font-size-sm);
  font-weight: 600;
  white-space: nowrap;
}

.dj-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.dj-pill--success {
  background: var(--dj-color-success-bg);
  color: var(--dj-color-success-text);
}

.dj-pill--warning {
  background: var(--dj-color-warning-bg);
  color: var(--dj-color-warning-text);
}

.dj-pill--danger {
  background: var(--dj-color-danger-bg);
  color: var(--dj-color-danger-text);
}

.dj-pill--neutral {
  background: var(--dj-color-neutral-bg);
  color: var(--dj-color-neutral-text);
}

.dj-banner {
  display: flex;
  flex-direction: column;
  gap: var(--dj-space-1);
  border-radius: var(--dj-radius-md);
  border: 1px solid transparent;
  padding: var(--dj-space-3) var(--dj-space-4);
}

.dj-banner__title {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.dj-banner__description {
  font-size: var(--dj-font-size-sm);
}

.dj-banner--info {
  background: var(--dj-color-neutral-bg);
  color: var(--dj-color-neutral-text);
  border-color: var(--dj-color-border);
}

.dj-banner--warning {
  background: var(--dj-color-warning-bg);
  color: var(--dj-color-warning-text);
}

.dj-banner--danger {
  background: var(--dj-color-danger-bg);
  color: var(--dj-color-danger-text);
}

.dj-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dj-space-3);
  text-align: center;
  padding: var(--dj-space-6) var(--dj-space-4);
  color: var(--dj-color-text-muted);
}

.dj-state__title {
  font-size: var(--dj-font-size-lg);
  font-weight: 600;
  color: var(--dj-color-text);
}

.dj-state__description {
  max-width: 32rem;
  font-size: var(--dj-font-size-md);
}

.dj-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--dj-color-border);
  border-top-color: var(--dj-color-primary);
  animation: dj-spin 0.8s linear infinite;
}

@keyframes dj-spin {
  to {
    transform: rotate(360deg);
  }
}

.dj-empty-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--dj-radius-md);
  border: 2px dashed var(--dj-color-border);
}
`;
