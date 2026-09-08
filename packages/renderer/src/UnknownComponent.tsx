export interface UnknownComponentProps {
  type: string;
}

export function UnknownComponent({ type }: UnknownComponentProps) {
  return <div className="mpp-unknown">Unknown component: {type}</div>;
}
