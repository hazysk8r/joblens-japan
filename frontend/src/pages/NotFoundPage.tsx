import { Link } from "react-router";
import "./NotFoundPage.css";

export default function NotFoundPage() {
  return (
    <main className="not-found-page">
      <h1>ページが見つかりません</h1>
      <p>
        お探しのページは存在しないか、
        移動された可能性があります。
      </p>

      <Link to="/">
        ホームに戻る
      </Link>
    </main>
  );
}