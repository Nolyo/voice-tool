import { describe, expect, it } from "vitest";
import { TranscriptAssembler, stripEllipses } from "./assembler";

describe("TranscriptAssembler", () => {
  it("joins chunks in index order even when upserted out of order", () => {
    const a = new TranscriptAssembler();
    a.upsert(2, "trois.");
    a.upsert(0, "Un,");
    a.upsert(1, "deux,");
    expect(a.assembled()).toBe("Un, deux, trois.");
  });

  it("skips missing indexes without blocking assembly", () => {
    const a = new TranscriptAssembler();
    a.upsert(0, "Début");
    a.upsert(3, "fin.");
    expect(a.assembled()).toBe("Début fin.");
  });

  it("excludes failed chunks from the join but counts them", () => {
    const a = new TranscriptAssembler();
    a.upsert(0, "Bonjour");
    a.markFailed(1);
    a.upsert(2, "monde.");
    expect(a.assembled()).toBe("Bonjour monde.");
    expect(a.okCount).toBe(2);
    expect(a.failedCount).toBe(1);
  });

  it("ignores empty and whitespace-only chunk texts in the join", () => {
    const a = new TranscriptAssembler();
    a.upsert(0, "Texte");
    a.upsert(1, "   ");
    a.upsert(2, "");
    a.upsert(3, "suite.");
    expect(a.assembled()).toBe("Texte suite.");
  });

  it("normalizes runs of whitespace between chunks", () => {
    const a = new TranscriptAssembler();
    a.upsert(0, "  Un  ");
    a.upsert(1, "\ndeux\t");
    expect(a.assembled()).toBe("Un deux");
  });

  it("overwrites on double upsert of the same index", () => {
    const a = new TranscriptAssembler();
    a.upsert(0, "brouillon");
    a.upsert(0, "final.");
    expect(a.assembled()).toBe("final.");
    expect(a.okCount).toBe(1);
  });

  it("a later success clears a previous failure for that index", () => {
    const a = new TranscriptAssembler();
    a.markFailed(0);
    a.upsert(0, "récupéré.");
    expect(a.assembled()).toBe("récupéré.");
    expect(a.failedCount).toBe(0);
  });

  it("strips ellipses from chunk texts before assembly", () => {
    const a = new TranscriptAssembler();
    a.upsert(0, "ni le feu ni la glace ne serait...");
    a.upsert(1, "atteindre en intensité, ce qu'enferme un homme dans l'illusion.");
    a.upsert(2, "... de son cœur.");
    expect(a.assembled()).toBe(
      "ni le feu ni la glace ne serait atteindre en intensité, ce qu'enferme un homme dans l'illusion. de son cœur.",
    );
  });

  it("excludes chunks that were only ellipses from the join", () => {
    const a = new TranscriptAssembler();
    a.upsert(0, "Début");
    a.upsert(1, "...");
    a.upsert(2, "fin.");
    expect(a.assembled()).toBe("Début fin.");
  });

  it("still counts an ellipsis-only chunk as a successful upload", () => {
    const a = new TranscriptAssembler();
    a.upsert(0, "...");
    expect(a.okCount).toBe(1);
    expect(a.assembled()).toBe("");
  });
});

describe("stripEllipses", () => {
  it("removes a trailing ellipsis glued to a word", () => {
    expect(stripEllipses("ni le feu ni la glace ne serait... atteindre")).toBe(
      "ni le feu ni la glace ne serait atteindre",
    );
  });

  it("removes a free-standing ellipsis between sentences", () => {
    expect(stripEllipses("dans l'illusion. ... de son cœur.")).toBe(
      "dans l'illusion. de son cœur.",
    );
  });

  it("removes unicode ellipses, including repeated ones", () => {
    expect(stripEllipses("Bonjour… monde")).toBe("Bonjour monde");
    expect(stripEllipses("Attends……")).toBe("Attends");
  });

  it("removes runs of more than three dots", () => {
    expect(stripEllipses("euh.... donc")).toBe("euh donc");
  });

  it("returns an empty string for ellipsis-only text", () => {
    expect(stripEllipses("...")).toBe("");
    expect(stripEllipses(" … ")).toBe("");
  });

  it("keeps sentence punctuation preceding an ellipsis", () => {
    expect(stripEllipses("Quoi ?...")).toBe("Quoi ?");
    expect(stripEllipses("Non !...")).toBe("Non !");
  });

  it("keeps two dots (not an ellipsis)", () => {
    expect(stripEllipses("Attends..")).toBe("Attends..");
  });

  it("leaves text without ellipses unchanged", () => {
    expect(stripEllipses("Un, deux, trois.")).toBe("Un, deux, trois.");
  });

  it("does not leave a space before a comma or period after stripping", () => {
    expect(stripEllipses("Il faudrait..., je pense")).toBe("Il faudrait, je pense");
    expect(stripEllipses("voilà… .")).toBe("voilà.");
  });

  it("keeps the French space before ? and !", () => {
    expect(stripEllipses("Quoi... ?")).toBe("Quoi ?");
    expect(stripEllipses("Non… !")).toBe("Non !");
  });
});
