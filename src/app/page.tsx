import BarChart from "@/reviz/components/charts/BarChart";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <h1 className="mb-6 font-sans text-2xl font-semibold">reviz — build check</h1>
      <div className="rounded-reviz border border-border bg-surface p-6">
        <BarChart
          title="1XWM success rate by task"
          yLabel="Success rate (%)"
          highlightIndex={3}
          data={[
            { label: "Steam Shirt", value: 93 },
            { label: "Grab Chips", value: 80 },
            { label: "Sliding Door", value: 77 },
            { label: "Iron Shirt", value: 67 },
            { label: "Watering Can", value: 60 },
            { label: "Scrub Dish", value: 20 },
          ]}
        />
      </div>
    </main>
  );
}
