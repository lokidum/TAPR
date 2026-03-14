import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/marketplace/data/chair_marketplace_models.dart';

class ChairMarketplaceRepository {
  ChairMarketplaceRepository(this._dio);

  final Dio _dio;

  Future<List<NearbyChairListing>> fetchNearby(
    double lat,
    double lng, {
    int radiusKm = 10,
    String? listingType,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/chairs/nearby',
      queryParameters: {
        'lat': lat,
        'lng': lng,
        'radiusKm': radiusKm,
        if (listingType != null) 'listingType': listingType,
      },
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final raw = data['listings'] as List<dynamic>;
    return raw
        .map((e) =>
            NearbyChairListing.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> fetchListing(String id) async {
    final response = await _dio.get<Map<String, dynamic>>('/chairs/$id');
    final data = response.data!['data'] as Map<String, dynamic>;
    return data['listing'] as Map<String, dynamic>;
  }

  Future<ChairRentalResult> rentChair(
    String listingId, {
    required DateTime startAt,
    required DateTime endAt,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/chairs/$listingId/rent',
      data: {
        'startAt': startAt.toUtc().toIso8601String(),
        'endAt': endAt.toUtc().toIso8601String(),
      },
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return ChairRentalResult.fromJson(data);
  }
}

final chairMarketplaceRepositoryProvider =
    Provider<ChairMarketplaceRepository>((ref) {
  return ChairMarketplaceRepository(ref.read(dioProvider));
});
