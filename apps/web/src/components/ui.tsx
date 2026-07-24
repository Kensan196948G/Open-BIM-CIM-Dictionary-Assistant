/**
 * dc デザイン共通部品 — カード・バッジ・トーンピル・ボタン・入力。
 * 数値（px・色）は Claude Design「Open BIM CIM Dictionary Assistant.dc」に一致させる。
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[10px] border border-line bg-white ${className}`}>
      {children}
    </section>
  );
}

/** 概念メタデータのバッジ（#F2F4F8 / 11px / 6px 角）。 */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-line bg-chip px-2 py-[2px] text-[11px] font-semibold text-sub">
      {children}
    </span>
  );
}

export type Tone = "ok" | "warn" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

/** 状態ピル（公開済み/レビュー待ち/却下・HTTPステータス等）。 */
export function TonePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-md px-2 py-[2px] text-[11px] font-semibold ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/** ブランド色（オレンジ）の主ボタン。 */
export function PrimaryButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`cursor-pointer rounded-lg border border-brand bg-brand px-[18px] py-[10px] text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    />
  );
}

/** 白地・罫線のサブボタン。 */
export function GhostButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`cursor-pointer rounded-lg border border-line bg-white text-ink disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    />
  );
}

/** 検索・質問の入力欄。 */
export function TextInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-lg border border-line px-[13px] py-[10px] font-sans text-[14px] outline-none ${className}`}
    />
  );
}

/** 中央寄せの空状態カード。 */
export function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-line bg-white p-6 text-center text-faint">
      {children}
    </div>
  );
}

/** 読み込み中表示。 */
export function LoadingCard({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="rounded-[10px] border border-line bg-white p-6 text-center text-faint"
    >
      {label}
    </div>
  );
}

/** エラー表示（警告トーンのカード）。 */
export function ErrorCard({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-[10px] border border-warn-line bg-warn-soft p-4 text-[13px] text-warn-deep"
    >
      {children}
    </div>
  );
}
