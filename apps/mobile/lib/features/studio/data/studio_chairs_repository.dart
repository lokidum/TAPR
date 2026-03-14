import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';

class ListingFeeIntentResult {
  const ListingFeeIntentResult({
    required this.clientSecret,
    required this.paymentIntentId,
  });

  final String clientSecret;
  final String paymentIntentId;

  factory ListingFeeIntentResult.fromJson(Map<String, dynamic> json) {
    return ListingFeeIntentResult(
      clientSecret: json['clientSecret'] as String,
      paymentIntentId: json['paymentIntentId'] as String,
    );
  }
}

class StudioChairsRepository {
  StudioChairsRepository(this._dio);

  final Dio _dio;

  Future<ListingFeeIntentResult> fetchListingFeeIntent() async {
    final response =
        await _dio.post<Map<String, dynamic>>('/chairs/listing-fee-intent');
    final data = response.data!['data'] as Map<String, dynamic>;
    return ListingFeeIntentResult.fromJson(data);
  }

  Future<Map<String, dynamic>> createChair({
    required String title,
    String? description,
    required int priceCentsPerDay,
    int? priceCentsPerWeek,
    required DateTime availableFrom,
    required DateTime availableTo,
    required String listingType,
    int minLevelRequired = 1,
    bool isSickCall = false,
    int sickCallPremiumPct = 0,
    required String paymentIntentId,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/chairs',
      data: {
        'title': title,
        if (description != null && description.isNotEmpty) 'description': description,
        'priceCentsPerDay': priceCentsPerDay,
        if (priceCentsPerWeek != null) 'priceCentsPerWeek': priceCentsPerWeek,
        'availableFrom': availableFrom.toUtc().toIso8601String(),
        'availableTo': availableTo.toUtc().toIso8601String(),
        'listingType': listingType,
        'minLevelRequired': minLevelRequired,
        'isSickCall': isSickCall,
        'sickCallPremiumPct': sickCallPremiumPct,
        'paymentIntentId': paymentIntentId,
      },
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return data['listing'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateChair(
    String id, {
    String? title,
    String? description,
    int? priceCentsPerDay,
    int? priceCentsPerWeek,
    DateTime? availableFrom,
    DateTime? availableTo,
    int? minLevelRequired,
    bool? isSickCall,
    int? sickCallPremiumPct,
  }) async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '/chairs/$id',
      data: {
        if (title != null) 'title': title,
        if (description != null) 'description': description,
        if (priceCentsPerDay != null) 'priceCentsPerDay': priceCentsPerDay,
        if (priceCentsPerWeek != null) 'priceCentsPerWeek': priceCentsPerWeek,
        if (availableFrom != null) 'availableFrom': availableFrom.toUtc().toIso8601String(),
        if (availableTo != null) 'availableTo': availableTo.toUtc().toIso8601String(),
        if (minLevelRequired != null) 'minLevelRequired': minLevelRequired,
        if (isSickCall != null) 'isSickCall': isSickCall,
        if (sickCallPremiumPct != null) 'sickCallPremiumPct': sickCallPremiumPct,
      },
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return data['listing'] as Map<String, dynamic>;
  }

  Future<void> deleteChair(String id) async {
    await _dio.delete<Map<String, dynamic>>('/chairs/$id');
  }
}

final studioChairsRepositoryProvider = Provider<StudioChairsRepository>((ref) {
  return StudioChairsRepository(ref.read(dioProvider));
});
