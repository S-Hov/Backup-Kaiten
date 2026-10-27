import { expect, it } from "vitest";
import { cardFixture } from "@/test/fixture";
import { cardViewModelSchema } from "./archive.schema";

it("accepts links without a description and preserves extra archive fields", () => {
  const card = cardFixture();
  card.sections.links = [
    { id: 1, url: "https://example.com", description: null },
  ];
  const result = cardViewModelSchema.parse({
    ...card,
    futureField: "preserved",
  });
  expect(result.sections.links[0].description).toBeNull();
  expect(result.futureField).toBe("preserved");
});
