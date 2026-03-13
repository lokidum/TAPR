import 'package:intl/intl.dart';

class Formatters {
  Formatters._();

  static final _currencyFormat = NumberFormat.currency(
    symbol: r'$',
    decimalDigits: 2,
  );

  static final _compactFormat = NumberFormat.compact();

  static String currency(int cents) {
    return _currencyFormat.format(cents / 100);
  }

  static String compactNumber(int number) {
    return _compactFormat.format(number);
  }

  static String relativeTime(DateTime dateTime) {
    final now = DateTime.now().toUtc();
    final diff = now.difference(dateTime.toUtc());

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    if (diff.inDays < 30) return '${(diff.inDays / 7).floor()}w ago';

    return DateFormat('d MMM yyyy').format(dateTime.toLocal());
  }

  static String dateShort(DateTime dateTime) {
    return DateFormat('d MMM').format(dateTime.toLocal());
  }

  static String dateFull(DateTime dateTime) {
    return DateFormat('d MMMM yyyy').format(dateTime.toLocal());
  }

  static String time(DateTime dateTime) {
    return DateFormat('h:mm a').format(dateTime.toLocal());
  }

  static String dateTime(DateTime dateTime) {
    return DateFormat('d MMM, h:mm a').format(dateTime.toLocal());
  }
}
