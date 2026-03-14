import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/barber/data/barber_profile_models.dart';

class BarberProfileRepository {
  BarberProfileRepository(this._dio);

  final Dio _dio;

  Future<BarberProfileDetail> fetchMyProfile() async {
    final response = await _dio.get<Map<String, dynamic>>('/barbers/me');
    final data = response.data!['data'] as Map<String, dynamic>;
    return BarberProfileDetail.fromJson(data);
  }

  Future<BarberProfileDetail> fetchProfile(String barberId) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/$barberId',
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return BarberProfileDetail.fromJson(data);
  }

  Future<({List<PortfolioItemModel> items, int total})> fetchPortfolio(
    String barberId, {
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/$barberId/portfolio',
      queryParameters: {'page': page, 'limit': limit},
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final rawItems = data['items'] as List<dynamic>;
    final items = rawItems
        .map((e) => PortfolioItemModel.fromJson(e as Map<String, dynamic>))
        .toList();
    final total = (data['total'] as num).toInt();
    return (items: items, total: total);
  }

  Future<({List<BarberReview> reviews, int total})> fetchReviews(
    String barberId, {
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/$barberId/reviews',
      queryParameters: {'page': page, 'limit': limit},
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final rawReviews = data['reviews'] as List<dynamic>;
    final reviews = rawReviews
        .map((e) => BarberReview.fromJson(e as Map<String, dynamic>))
        .toList();
    final total = (data['total'] as num).toInt();
    return (reviews: reviews, total: total);
  }

  /// PATCH /barbers/me
  Future<void> updateBarber({
    String? abn,
    String? aqfCertLevel,
    String? instagramHandle,
    String? tiktokHandle,
    int? serviceRadiusKm,
    String? certDocumentUrl,
  }) async {
    final body = <String, dynamic>{};
    if (abn != null) body['abn'] = abn;
    if (aqfCertLevel != null) body['aqfCertLevel'] = aqfCertLevel;
    if (instagramHandle != null) body['instagramHandle'] = instagramHandle;
    if (tiktokHandle != null) body['tiktokHandle'] = tiktokHandle;
    if (serviceRadiusKm != null) body['serviceRadiusKm'] = serviceRadiusKm;
    if (certDocumentUrl != null) body['certDocumentUrl'] = certDocumentUrl;
    await _dio.patch<Map<String, dynamic>>('/barbers/me', data: body);
  }

  /// POST /barbers/me/cert-upload-url
  Future<({String uploadUrl, String key, String cdnUrl})> fetchCertUploadUrl(
    String fileName,
    String mimeType,
  ) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/barbers/me/cert-upload-url',
      data: {'fileName': fileName, 'mimeType': mimeType},
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return (
      uploadUrl: data['uploadUrl'] as String,
      key: data['key'] as String,
      cdnUrl: data['cdnUrl'] as String,
    );
  }

  /// GET /barbers/me/stripe-onboarding-url
  Future<String> fetchStripeOnboardingUrl({
    required String returnUrl,
    required String refreshUrl,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/me/stripe-onboarding-url',
      queryParameters: {'returnUrl': returnUrl, 'refreshUrl': refreshUrl},
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return data['url'] as String;
  }
}

final barberProfileRepositoryProvider =
    Provider<BarberProfileRepository>((ref) {
  return BarberProfileRepository(ref.read(dioProvider));
});
