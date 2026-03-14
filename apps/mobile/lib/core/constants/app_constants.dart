class AppConstants {
  AppConstants._();

  static const String appName = 'TAPR';
  static const String appBaseUrl = 'https://tapr.com.au';
  static const String apiBaseUrl = 'https://api.tapr.com.au/api/v1';
  static const int connectTimeoutMs = 15000;
  static const int receiveTimeoutMs = 15000;
  static const int defaultPageSize = 20;
  static const int maxImageUploadBytes = 10 * 1024 * 1024;
  static const int maxEvidenceUrls = 5;
  static const int disputeWindowDays = 7;
}
