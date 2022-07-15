import styles from "../../styles/components/Box.module.scss";
const Box = ({ children, classes }) => {
  return <div className={`${styles.main} ${classes || ""}`}>{children}</div>;
};

export default Box;
