package cn.jingxi.content;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;
import net.sourceforge.pinyin4j.PinyinHelper;
import net.sourceforge.pinyin4j.format.*;
import net.sourceforge.pinyin4j.format.exception.BadHanyuPinyinOutputFormatCombination;

/** Readable, stable category URLs; UUIDs remain internal record identifiers only. */
final class CategorySlug {
  private CategorySlug() {}

  static String generate(String name, Set<String> used) {
    var format = new HanyuPinyinOutputFormat();
    format.setCaseType(HanyuPinyinCaseType.LOWERCASE);
    format.setToneType(HanyuPinyinToneType.WITHOUT_TONE);
    format.setVCharType(HanyuPinyinVCharType.WITH_V);
    String normalized = Normalizer.normalize(name, Normalizer.Form.NFKD)
        .replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT);
    var result = new StringBuilder();
    normalized.codePoints().forEach(cp -> {
      if ((cp >= 'a' && cp <= 'z') || (cp >= '0' && cp <= '9')) {
        result.appendCodePoint(cp);
      } else {
        result.append('-');
        if (cp <= Character.MAX_VALUE) {
          try {
            String[] readings = PinyinHelper.toHanyuPinyinStringArray((char) cp, format);
            if (readings != null && readings.length > 0) result.append(readings[0]).append('-');
          } catch (BadHanyuPinyinOutputFormatCombination ex) {
            throw new IllegalStateException("Invalid pinyin output configuration", ex);
          }
        }
      }
    });
    String base = result.toString().replaceAll("-+", "-").replaceAll("^-|-$", "");
    if (base.isEmpty()) throw ApiException.invalid("分类名称需包含可转换为英文或拼音的文字或数字");
    base = limit(base, 80);
    String candidate = base;
    for (int number = 2; used.contains(candidate); number++) {
      String suffix = "-" + number;
      candidate = limit(base, 80 - suffix.length()) + suffix;
    }
    return candidate;
  }

  private static String limit(String value, int max) {
    if (value.length() <= max) return value;
    String prefix = value.substring(0, max);
    int boundary = prefix.lastIndexOf('-');
    return boundary > 0 ? prefix.substring(0, boundary) : prefix;
  }
}
