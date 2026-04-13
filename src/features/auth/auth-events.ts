export const AUTH_INVALID_EVENT = 'brainflow-auth-invalid'

export function dispatchAuthInvalidEvent(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT))
}

