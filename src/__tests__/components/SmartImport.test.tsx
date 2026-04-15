import { render, screen } from "@testing-library/react";
import { SmartImport, serializeFrames } from "../../components/SmartImport";

// Stub the sprite-sheet processor so the test doesn't need a real canvas pipeline
vi.mock("../../utils/spriteSheetProcessor", () => ({
  loadImage: vi.fn(),
  prepareCanvas: vi.fn(),
  detectRows: vi.fn(),
  extractFrames: vi.fn(),
  getFramePreview: vi.fn(),
  createStripFromFrames: vi.fn(),
}));

describe("SmartImport", () => {
  it("renders the dropzone when no file is loaded", () => {
    render(<SmartImport onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Choose a sprite sheet/i)).toBeInTheDocument();
  });

  it("mounts the picker screen with edit-mode props", () => {
    render(
      <SmartImport
        onSave={vi.fn()}
        onCancel={vi.fn()}
        initialName="EditMe"
        editingId="custom-abc"
      />
    );
    expect(screen.getByTestId("smart-import-pick")).toBeInTheDocument();
  });
});

describe("serializeFrames", () => {
  it("returns empty string for empty array", () => {
    expect(serializeFrames([])).toBe("");
  });
  it("collapses ascending runs", () => {
    expect(serializeFrames([1, 2, 3, 4])).toBe("1-4");
  });
  it("preserves descending runs as a-b", () => {
    expect(serializeFrames([3, 2, 1])).toBe("3-1");
  });
  it("joins mixed singletons and runs", () => {
    expect(serializeFrames([1, 3, 4, 5, 7])).toBe("1,3-5,7");
  });
  it("keeps duplicates as singletons", () => {
    expect(serializeFrames([2, 2, 3])).toBe("2,2,3");
  });
});
