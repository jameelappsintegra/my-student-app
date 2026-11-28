import Layout from "../components/layout/layout";
import AdminDashboard from "../components/home/AdminDashboard";
import TeacherHome from "../components/home/TeacherHome";
import ParentHome from "../components/home/ParentHome";
import StudentHome from "../components/home/StudentHome";
import LibrarianHome from "../components/home/LibrarianHome";
import { useAuth } from "../context/auth";

// Each role lands on its own home screen.
export default function Home() {
  const { user, can } = useAuth();
  return (
    <Layout title="Home">
      {can("dashboard.view") ? <AdminDashboard /> : user?.role === "teacher" ? <TeacherHome /> : user?.role === "student" ? <StudentHome /> : user?.role === "librarian" ? <LibrarianHome /> : <ParentHome />}
    </Layout>
  );
}
