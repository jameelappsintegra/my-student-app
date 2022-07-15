import Link from "next/link";
import menuItems from "../../data/data";
import styles from "../../styles/components/Sidemenu.module.scss";
import { useRouter } from "next/router";

const Sidemenu = () => {
  const router = useRouter();
  return (
    <div className={styles.sidemenu}>
      <div className={styles.logo}>
        <a href="#" className="">
          <p className="text-3xl">EduPro </p>
        </a>
      </div>
      <ul className={styles.sidemenu_list}>
        {menuItems.map((item, index) => (
          <li
            key={index}
            className={router.pathname == `${item.link}` ? "active" : ""}
          >
            <Link href={item.link}>
              <a>{item.menu_name}</a>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Sidemenu;
