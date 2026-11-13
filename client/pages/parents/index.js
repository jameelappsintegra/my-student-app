import Layout from "../../components/layout/layout";
import { Card, EmptyState, PageHeader } from "../../components/common";

const Parents = () => (
  <Layout title="Parents">
    <PageHeader title="Parents" />
    <Card>
      <EmptyState
        title="Not available yet"
        message="Parent accounts and linking children to parents are planned for a later phase. Parent details captured during admission are stored on each student record."
      />
    </Card>
  </Layout>
);

export default Parents;
