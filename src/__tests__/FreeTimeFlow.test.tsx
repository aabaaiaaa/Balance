import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FreeTimeFlow } from "@/components/FreeTimeFlow";

describe("FreeTimeFlow", () => {
  const mockOnComplete = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    mockOnComplete.mockClear();
    mockOnCancel.mockClear();
  });

  it("renders step 1 with time selection options", () => {
    render(
      <FreeTimeFlow onComplete={mockOnComplete} onCancel={mockOnCancel} />
    );

    expect(screen.getByText("How much time do you have?")).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
    expect(screen.getByText("1 hour")).toBeInTheDocument();
    expect(screen.getByText("2+ hours")).toBeInTheDocument();
  });

  it("moves to step 2 when a time preset is selected", async () => {
    const user = userEvent.setup();

    render(
      <FreeTimeFlow onComplete={mockOnComplete} onCancel={mockOnCancel} />
    );

    await user.click(screen.getByText("30 min"));

    await waitFor(() => {
      expect(screen.getByText("How are you feeling?")).toBeInTheDocument();
    });

    // Energy options should be visible
    expect(screen.getByText("Energetic")).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getByText("Low energy")).toBeInTheDocument();
  });

  it("completes the flow with time and energy selection", async () => {
    const user = userEvent.setup();

    render(
      <FreeTimeFlow onComplete={mockOnComplete} onCancel={mockOnCancel} />
    );

    // Select 1 hour
    await user.click(screen.getByText("1 hour"));

    // Select energetic
    await waitFor(() => {
      expect(screen.getByText("Energetic")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Energetic"));

    expect(mockOnComplete).toHaveBeenCalledWith({
      availableMinutes: 60,
      energy: "energetic",
    });
  });

  it("allows skipping the energy step (defaults to normal)", async () => {
    const user = userEvent.setup();

    render(
      <FreeTimeFlow onComplete={mockOnComplete} onCancel={mockOnCancel} />
    );

    await user.click(screen.getByText("15 min"));

    await waitFor(() => {
      expect(screen.getByText("Skip this step")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Skip this step"));

    expect(mockOnComplete).toHaveBeenCalledWith({
      availableMinutes: 15,
      energy: "normal",
    });
  });

  it("calls onCancel when cancel is clicked on step 1", async () => {
    const user = userEvent.setup();

    render(
      <FreeTimeFlow onComplete={mockOnComplete} onCancel={mockOnCancel} />
    );

    await user.click(screen.getByLabelText("Cancel"));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it("shows back button on step 2 that returns to step 1", async () => {
    const user = userEvent.setup();

    render(
      <FreeTimeFlow onComplete={mockOnComplete} onCancel={mockOnCancel} />
    );

    await user.click(screen.getByText("30 min"));

    await waitFor(() => {
      expect(screen.getByLabelText("Back")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Back"));

    await waitFor(() => {
      expect(screen.getByText("How much time do you have?")).toBeInTheDocument();
    });
  });

  describe("Custom time input", () => {
    it("allows entering a custom time value", async () => {
      const user = userEvent.setup();

      render(
        <FreeTimeFlow onComplete={mockOnComplete} onCancel={mockOnCancel} />
      );

      // Click custom time
      await user.click(screen.getByText("Custom time..."));

      const customInput = screen.getByPlaceholderText("Minutes");
      await user.type(customInput, "45");
      await user.click(screen.getByText("Next"));

      // Should advance to step 2
      await waitFor(() => {
        expect(screen.getByText("How are you feeling?")).toBeInTheDocument();
      });

      // Complete with low energy
      await user.click(screen.getByText("Low energy"));

      expect(mockOnComplete).toHaveBeenCalledWith({
        availableMinutes: 45,
        energy: "low",
      });
    });

    it("disables Next button when custom input is empty or zero", async () => {
      const user = userEvent.setup();

      render(
        <FreeTimeFlow onComplete={mockOnComplete} onCancel={mockOnCancel} />
      );

      await user.click(screen.getByText("Custom time..."));

      const nextButton = screen.getByText("Next");
      expect(nextButton).toBeDisabled();
    });
  });
});
