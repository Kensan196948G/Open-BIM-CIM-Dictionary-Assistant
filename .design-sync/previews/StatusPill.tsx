import { StatusPill } from "@obcda/ui";

export const Success = () => <StatusPill tone="success">200 OK</StatusPill>;

export const Warning = () => <StatusPill tone="warning">404 Not Found</StatusPill>;

export const Error = () => <StatusPill tone="error">500 Error</StatusPill>;

export const Neutral = () => <StatusPill tone="neutral">未確認</StatusPill>;

export const AllTones = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <StatusPill tone="success">公開済み</StatusPill>
    <StatusPill tone="warning">更新確認中</StatusPill>
    <StatusPill tone="error">取得失敗</StatusPill>
    <StatusPill tone="neutral">下書き</StatusPill>
  </div>
);
