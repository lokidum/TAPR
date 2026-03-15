/// Validates Australian phone numbers for OTP flow.
///
/// Rules:
/// - Strip spaces and dashes before validating
/// - Must be digits only after stripping
/// - Valid formats:
///   - 10 digits starting with 04 (mobile)
///   - 9 digits starting with 2, 3, 7, or 8 (landline)
bool isValidAustralianPhone(String input) {
  final digits = input.replaceAll(RegExp(r'[\s\-]'), '');
  if (digits.isEmpty) return false;
  if (!RegExp(r'^\d+$').hasMatch(digits)) return false;

  if (digits.length == 10 && digits.startsWith('04')) return true;
  if (digits.length == 9 && ['2', '3', '7', '8'].contains(digits[0])) {
    return true;
  }
  return false;
}
