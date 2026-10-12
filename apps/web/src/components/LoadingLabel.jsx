export default function LoadingLabel({ children }) {
  return <span className="loading-label"><span className="button-spinner" aria-hidden="true" />{children}</span>
}
