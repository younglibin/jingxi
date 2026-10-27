import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkCard } from "../src/components/cards";
it("renders the saved crop rectangle instead of silently replacing it with a focal crop", () => {
  render(
    <WorkCard
      work={{
        publicKey: "p",
        slug: "project",
        title: "项目",
        summary: "",
        year: null,
        category: { slug: "other", name: "其他" },
        cover: {
          url: "/a.jpg",
          width: 1600,
          height: 800,
          alt: "封面",
          crop: { x: 0.3125, y: 0, width: 0.375, height: 1 },
          focal: { x: 0.9, y: 0.2 },
        },
      }}
    />,
  );
  const image = screen.getByRole("img", { name: "封面" }) as HTMLImageElement;
  expect(image).toHaveStyle({
    position: "absolute",
    top: "0%",
    height: "100%",
  });
  expect(parseFloat(image.style.left)).toBeCloseTo(-83.3333);
  expect(parseFloat(image.style.width)).toBeCloseTo(266.6667);
});
