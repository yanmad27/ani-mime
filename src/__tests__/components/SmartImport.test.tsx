import { render, screen } from "@testing-library/react";
import { SmartImport } from "../../components/SmartImport";

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
