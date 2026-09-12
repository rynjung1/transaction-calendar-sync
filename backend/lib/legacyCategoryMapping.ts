// Maps a legacy Plaid `category_id` to a PFC `primary` value, for
// transactions that predate PFC enrichment (personal_finance_category is
// absent). Sourced directly from Plaid's own official migration mapping:
// https://plaid.com/documents/transactions-personal-finance-category-mapping.json
// (fetched 2026-09-11), which gives a 1-to-many mapping of legacy category ->
// possible PFC values per Plaid's migration guide
// (https://plaid.com/docs/transactions/pfc-migration/).
//
// Deliberately ONLY includes entries where every possible PFC in that 1-to-many
// mapping shares the same `primary` (176 of Plaid's 242 published entries) —
// the other 66 are genuinely ambiguous at the primary level (e.g. legacy
// "Payment" maps to both TRANSFER_OUT and LOAN_PAYMENTS depending on context
// Plaid's newer model considers, which this data alone can't disambiguate).
// Guessing among ambiguous options was rejected on purpose: an incorrect
// guess here would actively cause a transaction to be wrongly excluded from
// the user's calendar, which is worse than the current (unchanged) behavior
// of simply not being able to exclude it by category. A category_id not
// present in this map is legitimately unmappable, not a bug.
export const LEGACY_CATEGORY_ID_TO_PFC_PRIMARY: Record<string, string> = {
  "10000000": "BANK_FEES", // Bank Fees
  "10001000": "BANK_FEES", // Bank Fees > Overdraft
  "10002000": "BANK_FEES", // Bank Fees > ATM
  "10003000": "BANK_FEES", // Bank Fees > Late Payment
  "10004000": "BANK_FEES", // Bank Fees > Fraud Dispute
  "10005000": "BANK_FEES", // Bank Fees > Foreign Transaction
  "10006000": "BANK_FEES", // Bank Fees > Wire Transfer
  "10007000": "BANK_FEES", // Bank Fees > Insufficient Funds
  "10008000": "BANK_FEES", // Bank Fees > Cash Advance
  "10009000": "BANK_FEES", // Bank Fees > Excess Activity
  "11000000": "TRANSFER_IN", // Cash Advance
  "12000000": "GENERAL_SERVICES", // Community
  "12002000": "TRANSFER_IN", // Community > Assisted Living Services
  "12004000": "GOVERNMENT_AND_NON_PROFIT", // Community > Courts
  "12005000": "GENERAL_SERVICES", // Community > Day Care and Preschools
  "12008000": "GENERAL_SERVICES", // Community > Education
  "12008003": "GENERAL_SERVICES", // Community > Education > Primary and Secondary Schools
  "12008009": "GENERAL_SERVICES", // Community > Education > Colleges and Universities
  "12012000": "GOVERNMENT_AND_NON_PROFIT", // Community > Law Enforcement
  "12015000": "GENERAL_SERVICES", // Community > Organizations and Associations
  "12015001": "GOVERNMENT_AND_NON_PROFIT", // Community > Organizations and Associations > Youth Organizations
  "12015003": "GOVERNMENT_AND_NON_PROFIT", // Community > Organizations and Associations > Charities and Non-Profits
  "12018000": "GOVERNMENT_AND_NON_PROFIT", // Community > Religious
  "12018004": "GOVERNMENT_AND_NON_PROFIT", // Community > Religious > Churches
  "13000000": "FOOD_AND_DRINK", // Food and Drink
  "13001000": "FOOD_AND_DRINK", // Food and Drink > Bar
  "13005000": "FOOD_AND_DRINK", // Food and Drink > Restaurants
  "13005012": "FOOD_AND_DRINK", // Food and Drink > Restaurants > Pizza
  "13005032": "FOOD_AND_DRINK", // Food and Drink > Restaurants > Fast Food
  "13005039": "FOOD_AND_DRINK", // Food and Drink > Restaurants > Dessert
  "13005043": "FOOD_AND_DRINK", // Food and Drink > Restaurants > Coffee Shop
  "14000000": "MEDICAL", // Healthcare
  "14001000": "MEDICAL", // Healthcare > Healthcare Services
  "14001008": "MEDICAL", // Healthcare > Healthcare Services > Mental Health
  "14001009": "MEDICAL", // Healthcare > Healthcare Services > Medical Supplies and Labs
  "14001010": "MEDICAL", // Healthcare > Healthcare Services > Hospitals, Clinics and Medical Centers
  "14001012": "MEDICAL", // Healthcare > Healthcare Services > Dentists
  "15001000": "INCOME", // Interest > Interest Earned
  "15002000": "BANK_FEES", // Interest > Interest Charged
  "16001000": "LOAN_PAYMENTS", // Payment > Credit Card
  "16002000": "RENT_AND_UTILITIES", // Payment > Rent
  "16003000": "LOAN_PAYMENTS", // Payment > Loan
  "17000000": "ENTERTAINMENT", // Recreation
  "17001000": "ENTERTAINMENT", // Recreation > Arts and Entertainment
  "17001007": "ENTERTAINMENT", // Recreation > Arts and Entertainment > Music and Show Venues
  "17001009": "ENTERTAINMENT", // Recreation > Arts and Entertainment > Movie Theatres
  "17001014": "ENTERTAINMENT", // Recreation > Arts and Entertainment > Casinos and Gaming
  "17015000": "PERSONAL_CARE", // Recreation > Golf
  "17018000": "PERSONAL_CARE", // Recreation > Gyms and Fitness Centers
  "17041000": "ENTERTAINMENT", // Recreation > Sports and Recreation Camps
  "17042000": "PERSONAL_CARE", // Recreation > Sports Clubs
  "17048000": "ENTERTAINMENT", // Recreation > Zoo
  "18001005": "GENERAL_SERVICES", // Service > Advertising and Marketing > Print, TV, Radio and Outdoor Advertising
  "18001008": "GENERAL_SERVICES", // Service > Advertising and Marketing > Direct Mail and Email Marketing Services
  "18001010": "GENERAL_SERVICES", // Service > Advertising and Marketing > Advertising Agencies and Media Buyers
  "18006000": "GENERAL_SERVICES", // Service > Automotive
  "18006001": "GENERAL_SERVICES", // Service > Automotive > Towing
  "18006003": "GENERAL_SERVICES", // Service > Automotive > Maintenance and Repair
  "18006004": "GENERAL_SERVICES", // Service > Automotive > Car Wash and Detail
  "18006007": "GENERAL_SERVICES", // Service > Automotive > Auto Tires
  "18007000": "GENERAL_SERVICES", // Service > Business and Strategy Consulting
  "18008000": "GENERAL_SERVICES", // Service > Business Services
  "18008001": "GENERAL_SERVICES", // Service > Business Services > Printing and Publishing
  "18012000": "GENERAL_MERCHANDISE", // Service > Computers
  "18014000": "GENERAL_SERVICES", // Service > Credit Counseling and Bankruptcy Services
  "18016000": "GENERAL_SERVICES", // Service > Employment Agencies
  "18018000": "ENTERTAINMENT", // Service > Entertainment
  "18020001": "GENERAL_SERVICES", // Service > Financial > Taxes
  "18020014": "GENERAL_SERVICES", // Service > Financial > Accounting and Bookkeeping
  "18021000": "FOOD_AND_DRINK", // Service > Food and Beverage
  "18021001": "FOOD_AND_DRINK", // Service > Food and Beverage > Distribution
  "18021002": "FOOD_AND_DRINK", // Service > Food and Beverage > Catering
  "18022000": "GENERAL_SERVICES", // Service > Funeral Services
  "18024000": "HOME_IMPROVEMENT", // Service > Home Improvement
  "18024007": "HOME_IMPROVEMENT", // Service > Home Improvement > Plumbing
  "18024008": "HOME_IMPROVEMENT", // Service > Home Improvement > Pest Control
  "18024009": "HOME_IMPROVEMENT", // Service > Home Improvement > Painting
  "18024010": "GENERAL_SERVICES", // Service > Home Improvement > Movers
  "18024013": "HOME_IMPROVEMENT", // Service > Home Improvement > Landscaping and Gardeners
  "18024018": "HOME_IMPROVEMENT", // Service > Home Improvement > Home Appliances
  "18025000": "HOME_IMPROVEMENT", // Service > Household
  "18030000": "GENERAL_SERVICES", // Service > Insurance
  "18033000": "GENERAL_SERVICES", // Service > Legal
  "18037000": "GENERAL_SERVICES", // Service > Manufacturing
  "18045000": "PERSONAL_CARE", // Service > Personal Care
  "18047000": "GENERAL_SERVICES", // Service > Photography
  "18050000": "GENERAL_SERVICES", // Service > Real Estate
  "18050001": "GENERAL_SERVICES", // Service > Real Estate > Real Estate Development and Title Companies
  "18050004": "GENERAL_SERVICES", // Service > Real Estate > Property Management
  "18053000": "GENERAL_SERVICES", // Service > Repair Services
  "18057000": "HOME_IMPROVEMENT", // Service > Security and Safety
  "18058000": "GENERAL_SERVICES", // Service > Shipping and Freight
  "18060000": "GENERAL_SERVICES", // Service > Storage
  "18063000": "RENT_AND_UTILITIES", // Service > Telecommunication Services
  "18068000": "RENT_AND_UTILITIES", // Service > Utilities
  "18068001": "RENT_AND_UTILITIES", // Service > Utilities > Water
  "18068002": "RENT_AND_UTILITIES", // Service > Utilities > Sanitary and Waste Management
  "18068004": "RENT_AND_UTILITIES", // Service > Utilities > Gas
  "18068005": "RENT_AND_UTILITIES", // Service > Utilities > Electric
  "18069000": "MEDICAL", // Service > Veterinarians
  "19000000": "GENERAL_MERCHANDISE", // Shops
  "19002000": "GENERAL_MERCHANDISE", // Shops > Antiques
  "19003000": "GENERAL_MERCHANDISE", // Shops > Arts and Crafts
  "19004000": "GENERAL_MERCHANDISE", // Shops > Auctions
  "19005000": "GENERAL_SERVICES", // Shops > Automotive
  "19005006": "GENERAL_SERVICES", // Shops > Automotive > Car Parts and Accessories
  "19005007": "GENERAL_SERVICES", // Shops > Automotive > Car Dealers and Leasing
  "19006000": "PERSONAL_CARE", // Shops > Beauty Products
  "19009000": "GENERAL_MERCHANDISE", // Shops > Bookstores
  "19010000": "GENERAL_MERCHANDISE", // Shops > Cards and Stationery
  "19011000": "GENERAL_MERCHANDISE", // Shops > Children
  "19012000": "GENERAL_MERCHANDISE", // Shops > Clothing and Accessories
  "19012001": "GENERAL_MERCHANDISE", // Shops > Clothing and Accessories > Women's Store
  "19012003": "GENERAL_MERCHANDISE", // Shops > Clothing and Accessories > Shoe Store
  "19012004": "GENERAL_MERCHANDISE", // Shops > Clothing and Accessories > Men's Store
  "19012006": "GENERAL_MERCHANDISE", // Shops > Clothing and Accessories > Kids' Store
  "19013001": "ENTERTAINMENT", // Shops > Computers and Electronics > Video Games
  "19013002": "GENERAL_MERCHANDISE", // Shops > Computers and Electronics > Mobile Phones
  "19013003": "GENERAL_MERCHANDISE", // Shops > Computers and Electronics > Cameras
  "19016000": "GENERAL_MERCHANDISE", // Shops > Costumes
  "19017000": "ENTERTAINMENT", // Shops > Dance and Music
  "19018000": "GENERAL_MERCHANDISE", // Shops > Department Stores
  "19019000": "GENERAL_MERCHANDISE", // Shops > Digital Purchase
  "19020000": "GENERAL_MERCHANDISE", // Shops > Discount Stores
  "19024000": "GENERAL_MERCHANDISE", // Shops > Florists
  "19025000": "FOOD_AND_DRINK", // Shops > Food and Beverage Store
  "19025004": "FOOD_AND_DRINK", // Shops > Food and Beverage Store > Beer, Wine and Spirits
  "19029000": "MEDICAL", // Shops > Glasses and Optometrist
  "19030000": "HOME_IMPROVEMENT", // Shops > Hardware Store
  "19031000": "GENERAL_MERCHANDISE", // Shops > Hobby and Collectibles
  "19032000": "GENERAL_MERCHANDISE", // Shops > Industrial Supplies
  "19033000": "GENERAL_MERCHANDISE", // Shops > Jewelry and Watches
  "19035000": "GENERAL_MERCHANDISE", // Shops > Marine Supplies
  "19036000": "ENTERTAINMENT", // Shops > Music, Video and DVD
  "19038000": "GENERAL_MERCHANDISE", // Shops > Newsstands
  "19039000": "GENERAL_MERCHANDISE", // Shops > Office Supplies
  "19040000": "GENERAL_MERCHANDISE", // Shops > Outlet
  "19042000": "GENERAL_MERCHANDISE", // Shops > Pets
  "19043000": "MEDICAL", // Shops > Pharmacies
  "19044000": "GENERAL_MERCHANDISE", // Shops > Photos and Frames
  "19046000": "GENERAL_MERCHANDISE", // Shops > Sporting Goods
  "19048000": "GENERAL_MERCHANDISE", // Shops > Tobacco
  "19049000": "GENERAL_MERCHANDISE", // Shops > Toys
  "19050000": "GENERAL_MERCHANDISE", // Shops > Vintage and Thrift
  "19051000": "GENERAL_MERCHANDISE", // Shops > Warehouses and Wholesale Stores
  "19052000": "GENERAL_MERCHANDISE", // Shops > Wedding and Bridal
  "19054000": "HOME_IMPROVEMENT", // Shops > Lawn and Garden
  "20002000": "GOVERNMENT_AND_NON_PROFIT", // Tax > Payment
  "21004000": "TRANSFER_IN", // Transfer > Check
  "21005000": "TRANSFER_IN", // Transfer > Credit
  "21006000": "TRANSFER_OUT", // Transfer > Debit
  "21007000": "TRANSFER_IN", // Transfer > Deposit
  "21007001": "TRANSFER_IN", // Transfer > Deposit > Check
  "21007002": "TRANSFER_IN", // Transfer > Deposit > ATM
  "21009000": "INCOME", // Transfer > Payroll
  "21009001": "INCOME", // Transfer > Payroll > Benefits
  "21010000": "TRANSFER_OUT", // Transfer > Third Party
  "21012000": "TRANSFER_OUT", // Transfer > Withdrawal
  "21012001": "TRANSFER_OUT", // Transfer > Withdrawal > Check
  "21012002": "TRANSFER_OUT", // Transfer > Withdrawal > ATM
  "22000000": "TRAVEL", // Travel
  "22001000": "TRAVEL", // Travel > Airlines and Aviation Services
  "22002000": "TRAVEL", // Travel > Airports
  "22003000": "TRAVEL", // Travel > Boat
  "22006000": "TRANSPORTATION", // Travel > Car Service
  "22006001": "TRANSPORTATION", // Travel > Car Service > Ride Share
  "22008000": "TRAVEL", // Travel > Cruises
  "22009000": "TRANSPORTATION", // Travel > Gas Stations
  "22012000": "TRAVEL", // Travel > Lodging
  "22012003": "TRAVEL", // Travel > Lodging > Hotels and Motels
  "22013000": "TRANSPORTATION", // Travel > Parking
  "22014000": "TRANSPORTATION", // Travel > Public Transportation Services
  "22015000": "TRANSPORTATION", // Travel > Rail
  "22016000": "TRANSPORTATION", // Travel > Taxi
  "22017000": "TRANSPORTATION", // Travel > Tolls and Fees
  "22018000": "TRANSPORTATION", // Travel > Transportation Centers
};
