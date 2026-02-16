import { render, screen } from "@testing-library/react";
import DashboardPage from "@/app/page";

describe("Dashboard page", () => {
  it("renders the welcome heading", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Welcome to Balance")).toBeInTheDocument();
  });
});
