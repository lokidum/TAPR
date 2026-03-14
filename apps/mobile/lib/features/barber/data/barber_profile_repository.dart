import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/barber/data/barber_profile_models.dart';

class BarberProfileRepository {
  BarberProfileRepository(this._dio);

  final Dio _dio;

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
}

final barberProfileRepositoryProvider =
    Provider<BarberProfileRepository>((ref) {
  return BarberProfileRepository(ref.read(dioProvider));
});
