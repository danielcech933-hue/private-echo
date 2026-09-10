import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/messages")({
  component: () => <Navigate to="/" replace />,
});
