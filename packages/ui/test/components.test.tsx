import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Badge,
  EmptyState,
  ResultCard,
  SearchBox,
  SectionCard,
  StatusPill,
} from "../src";

afterEach(cleanup);

describe("Badge", () => {
  it("renders its text content", () => {
    render(<Badge>IFC4.3</Badge>);
    expect(screen.getByText("IFC4.3")).toBeTruthy();
  });
});

describe("StatusPill", () => {
  it("renders text for every tone (meaning never relies on color alone)", () => {
    render(
      <>
        <StatusPill tone="success">200</StatusPill>
        <StatusPill tone="error">500</StatusPill>
      </>,
    );
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("500")).toBeTruthy();
  });
});

describe("SearchBox", () => {
  it("submits the trimmed query via onSearch and ignores empty input", () => {
    const onSearch = vi.fn();
    render(<SearchBox onSearch={onSearch} />);
    const input = screen.getByLabelText("用語を検索");

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "  線形  " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(onSearch).toHaveBeenCalledWith("線形");
  });

  it("syncs when initialQuery changes", () => {
    const { rerender } = render(<SearchBox onSearch={() => {}} initialQuery="a" />);
    rerender(<SearchBox onSearch={() => {}} initialQuery="b" />);
    expect((screen.getByLabelText("用語を検索") as HTMLInputElement).value).toBe("b");
  });
});

describe("ResultCard", () => {
  it("renders name, badges, summary and footnote", () => {
    render(
      <ResultCard
        name="IfcAlignment"
        badges={["IFC", "entity", "IFC4.3.2.0"]}
        summary="線形を表す概念"
        footnote="一致理由: 識別子一致"
      />,
    );
    expect(screen.getByText("IfcAlignment")).toBeTruthy();
    expect(screen.getByText("entity")).toBeTruthy();
    expect(screen.getByText("線形を表す概念")).toBeTruthy();
    expect(screen.getByText(/識別子一致/)).toBeTruthy();
  });
});

describe("SectionCard", () => {
  it("labels the section with its heading", () => {
    render(<SectionCard title="📊 システム情報">中身</SectionCard>);
    const region = screen.getByRole("region", { name: /システム情報/ });
    expect(region).toBeTruthy();
    expect(screen.getByText("中身")).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("announces via role=status with title and hint", () => {
    render(<EmptyState title="見つかりませんでした" hint="表記を変えてください" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("見つかりませんでした");
    expect(status.textContent).toContain("表記を変えてください");
  });
});
