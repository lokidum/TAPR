import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/studio/data/studio_models.dart';

class StudioRepository {
  StudioRepository(this._dio);

  final Dio _dio;

  Future<StudioProfile> fetchMyProfile() async {
    final response = await _dio.get<Map<String, dynamic>>('/studios/me');
    final data = response.data!['data'] as Map<String, dynamic>;
    return StudioProfile.fromJson(data);
  }

  Future<({List<StudioChairListing> listings, int total})> fetchMyChairs({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/studios/me/chairs',
      queryParameters: {'page': page, 'limit': limit},
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final raw = data['listings'] as List<dynamic>;
    final listings = raw
        .map((e) => StudioChairListing.fromJson(e as Map<String, dynamic>))
        .toList();
    final total = (data['total'] as num).toInt();
    return (listings: listings, total: total);
  }

  Future<StudioStats> fetchMyStats() async {
    final response = await _dio.get<Map<String, dynamic>>('/studios/me/stats');
    final data = response.data!['data'] as Map<String, dynamic>;
    return StudioStats.fromJson(data);
  }

  Future<List<StudioRentalSummary>> fetchRecentRentals() async {
    final response =
        await _dio.get<Map<String, dynamic>>('/studios/me/rentals/recent');
    final data = response.data!['data'] as Map<String, dynamic>;
    final raw = data['rentals'] as List<dynamic>;
    return raw
        .map((e) => StudioRentalSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

final studioRepositoryProvider = Provider<StudioRepository>((ref) {
  return StudioRepository(ref.read(dioProvider));
});
