import { Link } from "react-router";
import "./NotFoundPage.css";
import PageTitle from '../components/PageTitle';

export default function NotFoundPage() {
  return (
    <main className="not-found-page">
      <PageTitle name="ページが見つかりません" />
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