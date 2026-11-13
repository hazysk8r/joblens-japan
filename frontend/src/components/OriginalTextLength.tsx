import './OriginalTextLength.css';
import { ORIGINAL_TEXT_MAX_LENGTH, originalTextLengthOf } from '../utils/originalTextLength';

/**
 * 求人原文の文字数と上限。入力欄の説明(aria-describedby)として使う。
 * 1文字ごとに読み上げると入力の邪魔になるため、ライブリージョンにはしない。
 * 求人サイトのページを丸ごと貼ると上限を超えやすいため、超えたら減らし方も伝える。
 */
export default function OriginalTextLength({ id, text }: { id: string; text: string }) {
  const length = originalTextLengthOf(text);
  const over = length - ORIGINAL_TEXT_MAX_LENGTH;

  return (
    <p
      id={id}
      className={over > 0 ? 'original-text-length original-text-length--over' : 'original-text-length'}
    >
      {`${length.toLocaleString('ja-JP')} / ${ORIGINAL_TEXT_MAX_LENGTH.toLocaleString('ja-JP')}文字`}
      {over > 0 && (
        <span className="original-text-length__over">
          {`${ORIGINAL_TEXT_MAX_LENGTH.toLocaleString('ja-JP')}文字を${over.toLocaleString('ja-JP')}文字超えています。`
            + '求人サイトのページの下にある、ほかの求人などを除いてください。'}
        </span>
      )}
    </p>
  );
}
