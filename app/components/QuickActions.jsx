import SectionCard from "./SectionCard";
import SalesTable from "./SalesTable";

export default function QuickActions({ recentSales = [] }) {
  return (
    <SectionCard title="Recent sales">
      <SalesTable rows={recentSales} />
    </SectionCard>
  );
}
