import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { afterEach, expect, it } from "vitest";

afterEach(cleanup);

function HookConsumers() {
  useReducedMotion();
  const result = useQuery({ queryKey: ["react-dispatcher"], queryFn: async () => 42 });
  return <output>{result.data}</output>;
}

it("renders motion and query hooks together under the React renderer", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <HookConsumers />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(view.getByRole("status")).toHaveTextContent("42"));
  client.clear();
});
