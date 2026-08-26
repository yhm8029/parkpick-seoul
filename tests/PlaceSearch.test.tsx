import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PlaceSearch } from "@/components/PlaceSearch";
import type { Place } from "@/lib/types";

const SELECTED: Place = {
  id: "seoul-station",
  name: "서울역",
  address: "서울특별시 용산구",
  latitude: 37.5547,
  longitude: 126.9707,
  source: "NAVER",
};

afterEach(cleanup);

it("keeps a new query when editing a selected place", () => {
  function Harness() {
    const [selected, setSelected] = useState<Place | null>(SELECTED);
    return (
      <PlaceSearch
        label="목적지 검색"
        placeholder="장소 검색"
        selected={selected}
        onSelect={setSelected}
        onClear={() => setSelected(null)}
      />
    );
  }

  render(<Harness />);
  const input = screen.getByRole("combobox", { name: "목적지 검색" });
  fireEvent.change(input, { target: { value: "홍" } });

  expect((input as HTMLInputElement).value).toBe("홍");
});

it("reflects an externally replaced or cleared selection", () => {
  const replacement = { ...SELECTED, id: "gangnam", name: "강남역" };
  const props = {
    label: "목적지 검색",
    placeholder: "장소 검색",
    onSelect: vi.fn(),
    onClear: vi.fn(),
  };
  const { rerender } = render(<PlaceSearch {...props} selected={SELECTED} />);
  const input = screen.getByRole("combobox", { name: "목적지 검색" }) as HTMLInputElement;

  rerender(<PlaceSearch {...props} selected={replacement} />);
  expect(input.value).toBe("강남역");

  rerender(<PlaceSearch {...props} selected={null} />);
  expect(input.value).toBe("");
});
