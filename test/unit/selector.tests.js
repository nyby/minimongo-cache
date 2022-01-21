const { randomHex } = require("../helpers/randomHex");
const { expect } = require("chai");
const { compileDocumentSelector, compileSort } = require("../../src/selector");

describe("selector", function () {
  describe(compileSort.name, function () {
    it("is not implemented");
  });
  describe(compileDocumentSelector.name, function () {
    it("compiles a selector for empty object", function () {
      const selector = compileDocumentSelector({});
      expect(selector({})).to.deep.equal(true);
    });

    describe("field selector", function () {
      const fn = () => {};
      const values = [
        undefined,
        null,
        "foo",
        13579,
        true,
        ["foo"],
        { foo: "bar" },
        fn,
      ];

      values.forEach((value) => {
        const type = typeof value;

        it(`compiles a selector for a ${type} field`, function () {
          const selector = compileDocumentSelector({ _id: value });

          expect(selector({ _id: value })).to.deep.equal(true);
          [
            undefined,
            null,
            1,
            "1",
            "",
            "bar",
            true,
            false,
            {},
            [],
            new Date(),
            () => {},
            randomHex(),
          ].forEach((_id) => {
            if (_id == value) return;
            expect(
              selector({ _id }),
              JSON.stringify({ value, _id })
            ).to.deep.equal(false);
          });
        });
      });

      it("compiles a selector for RegExp field", function () {
        const selector = compileDocumentSelector({ _id: /foo/g });
        expect(selector({ _id: randomHex() })).to.equal(false);
        expect(selector({ _id: undefined })).to.equal(false);
        expect(selector({ _id: null })).to.equal(false);
        expect(selector({ _id: "somefoodoc" })).to.equal(true);
      });

      it("compiles a selector for nested lookups", function () {
        const selector = compileDocumentSelector({ "_id.foo": "bar" });
        expect(selector({ _id: undefined })).to.equal(false);
        expect(selector({ _id: null })).to.equal(false);
        expect(selector({ _id: {} })).to.equal(false);
        expect(selector({ _id: { foo: undefined } })).to.equal(false);
        expect(selector({ _id: { foo: null } })).to.equal(false);
        expect(selector({ _id: { foo: "foo" } })).to.equal(false);
        expect(selector({ _id: { foo: "bar" } })).to.equal(true);

        const selector2 = compileDocumentSelector({ "_id.foo": 1 });
        expect(selector2({ _id: { foo: [] } })).to.equal(false);
        expect(selector2({ _id: [] })).to.equal(false);
        expect(selector2({ _id: { foo: [1] } })).to.equal(true);
        expect(selector2({ _id: [{ foo: 1 }] })).to.equal(true);
      });

      it("throws on inconsistent selectors", function () {
        expect(() =>
          compileDocumentSelector({ _id: { $lt: 1, lt: 2 } })
        ).to.throw("Inconsistent selector: ");
      });
      it("throws on unrecognized operator", function () {
        expect(() =>
          compileDocumentSelector({ _id: { $foo: [1, 2, 3] } })
        ).to.throw("Unrecognized operator: $foo");
      });
    });

    describe("value operators", function () {
      const falsyValues = [
        undefined,
        null,
        1,
        "1",
        "",
        "bar",
        true,
        false,
        {},
        [],
        new Date(),
        () => {},
        randomHex(),
      ];

      it("$in", function () {
        expect(() => compileDocumentSelector({ _id: { $in: 1 } })).to.throw(
          "Argument to $in must be array"
        );

        const value1 = randomHex();
        const value2 = randomHex();
        const selector = compileDocumentSelector({
          _id: { $in: [value1, value2] },
        });

        expect(selector({ _id: value1 })).to.deep.equal(true);
        expect(selector({ _id: value2 })).to.deep.equal(true);

        falsyValues.forEach((_id) => {
          expect(selector({ _id })).to.deep.equal(false);
        });
      });
      it("$all", function () {
        expect(() => compileDocumentSelector({ _id: { $all: 1 } })).to.throw(
          "Argument to $all must be array"
        );

        const selector = compileDocumentSelector({
          _id: { $all: ["foo", "bar"] },
        });
        expect(selector({ _id: ["foo", "bar"] })).to.equal(true);
        expect(selector({ _id: ["foo"] })).to.equal(false);
        expect(selector({ _id: ["bar"] })).to.equal(false);
        expect(selector({ _id: [] })).to.equal(false);
        expect(selector({ _id: "foo" })).to.equal(false);

        // nested
        const selector1 = compileDocumentSelector({
          _id: { $all: [["foo"], ["bar"]] },
        });
        expect(selector1({ _id: ["foo", "bar"] })).to.equal(false);
        expect(selector1({ _id: [["foo"], ["bar"]] })).to.equal(true);
      });
      it("$lt", function () {
        const selector = compileDocumentSelector({ _id: { $lt: 100 } });
        let i;
        for (i = -100; i < 100; i++) {
          expect(selector({ _id: i })).to.deep.equal(true);
        }

        expect(selector({ _id: 100 })).to.deep.equal(false);
        expect(selector({ _id: 101 })).to.deep.equal(false);

        expect(selector({ _id: Number.MAX_SAFE_INTEGER * 2 })).to.deep.equal(
          false
        );
        expect(selector({ _id: Number.MAX_VALUE * 2 })).to.deep.equal(false);
      });
      it("$lte", function () {
        const selector = compileDocumentSelector({ _id: { $lte: 100 } });
        let i;
        for (i = -100; i <= 100; i++) {
          expect(selector({ _id: i })).to.deep.equal(true);
        }

        expect(selector({ _id: 101 })).to.deep.equal(false);

        expect(selector({ _id: Number.MAX_SAFE_INTEGER * 2 })).to.deep.equal(
          false
        );
        expect(selector({ _id: Number.MAX_VALUE * 2 })).to.deep.equal(false);
      });
      it("$gt", function () {
        const selector = compileDocumentSelector({ _id: { $gt: 100 } });
        let i;
        for (i = -100; i <= 100; i++) {
          expect(selector({ _id: i })).to.deep.equal(false);
        }

        expect(selector({ _id: 101 })).to.deep.equal(true);

        expect(selector({ _id: Number.MAX_SAFE_INTEGER * 2 })).to.deep.equal(
          true
        );
        expect(selector({ _id: Number.MAX_VALUE * 2 })).to.deep.equal(true);
      });
      it("$gte", function () {
        const selector = compileDocumentSelector({ _id: { $gte: 100 } });
        let i;
        for (i = -100; i < 100; i++) {
          expect(selector({ _id: i })).to.deep.equal(false);
        }

        expect(selector({ _id: 100 })).to.deep.equal(true);
        expect(selector({ _id: 101 })).to.deep.equal(true);

        expect(selector({ _id: Number.MAX_SAFE_INTEGER * 2 })).to.deep.equal(
          true
        );
        expect(selector({ _id: Number.MAX_VALUE * 2 })).to.deep.equal(true);
      });
      it("$ne", function () {
        const selector = compileDocumentSelector({ _id: { $ne: 0 } });
        let i;
        for (i = -100; i < 100; i++) {
          if (i === 0) {
            expect(selector({ _id: i })).to.deep.equal(false);
          } else {
            expect(selector({ _id: i })).to.deep.equal(true);
          }
        }
      });
      it("$nin", function () {
        expect(() => compileDocumentSelector({ _id: { $nin: 1 } })).to.throw(
          "Argument to $nin must be array"
        );

        const value1 = randomHex();
        const value2 = randomHex();
        const selector = compileDocumentSelector({
          _id: { $nin: [value1, value2] },
        });

        expect(selector({ _id: value1 })).to.deep.equal(false);
        expect(selector({ _id: value2 })).to.deep.equal(false);

        falsyValues.forEach((_id) => {
          expect(selector({ _id })).to.deep.equal(true);
        });
      });
      it("$exists", function () {
        const selector = compileDocumentSelector({ _id: { $exists: true } });
        expect(selector({})).to.deep.equal(false);
        expect(selector({ _id: undefined })).to.deep.equal(false);
        expect(selector({ _id: null })).to.deep.equal(true);
        expect(selector({ _id: randomHex() })).to.deep.equal(true);

        const selector2 = compileDocumentSelector({ _id: { $exists: false } });
        expect(selector2({})).to.deep.equal(true);
        expect(selector2({ _id: undefined })).to.deep.equal(true);
        expect(selector2({ _id: null })).to.deep.equal(false);
        expect(selector2({ _id: randomHex() })).to.deep.equal(false);
      });
      it("$mod", function () {
        const even = compileDocumentSelector({ _id: { $mod: [2, 0] } });
        const odd = compileDocumentSelector({ _id: { $mod: [2, 1] } });

        expect(even({ _id: 1 })).to.equal(false);
        expect(even({ _id: 2 })).to.equal(true);
        expect(odd({ _id: 2 })).to.equal(false);
        expect(odd({ _id: 1 })).to.equal(true);
      });
      it("$size", function () {
        const selector = compileDocumentSelector({ _id: { $size: 2 } });
        expect(selector({})).to.equal(false);
        expect(selector({ _id: randomHex() })).to.equal(false);
        expect(selector({ _id: [] })).to.equal(false);
        expect(selector({ _id: [randomHex()] })).to.equal(false);
        expect(selector({ _id: [randomHex(), randomHex()] })).to.equal(true);
        expect(selector({ _id: [1, 2, 3] })).to.equal(false);
      });
      it("$type", function () {
        const test = (info, $type, truthy, falsey) => {
          const selector = compileDocumentSelector({ _id: { $type } });
          truthy.forEach((_id) =>
            expect(selector({ _id }), _id).to.equal(true)
          );
          falsey.forEach((_id) =>
            expect(selector({ _id }), _id).to.equal(false)
          );
        };

        const bin = Uint8Array.from("123");
        const date = new Date();
        class Custom {}

        test(
          "number",
          1,
          [1, -1, 0, 1.1, Infinity],
          [date, bin, "0", "1", {}, [], () => {}, true, false, null, undefined]
        );
        test(
          "string",
          2,
          ["foo", "", " ", "1"],
          [date, bin, 0, /foo/, {}, [], () => {}, true, false, null, undefined]
        );
        test(
          "boolean",
          8,
          [true, false],
          [date, bin, 0, 1, "", " ", "wqe", {}, () => {}, [], null, undefined]
        );
        test(
          "array",
          4,
          [[[]]],
          [date, bin, 0, 1, "", " ", "wqe", {}, null, undefined, () => {}]
        );
        test(
          "regex",
          11,
          [/foo/],
          [date, bin, 0, 1, "", " ", "wqe", {}, [], null, undefined, () => {}]
        );
        test(
          "date",
          9,
          [new Date()],
          [bin, Date, 0, 1, "", " ", "wqe", {}, [], null, undefined]
        );
        test(
          "binary",
          5,
          [bin],
          [date, 0, 1, "", " ", "wqe", {}, [], null, undefined]
        );
        test(
          "object",
          3,
          [{}, new Custom()],
          [date, 0, 1, "", " ", "wqe", [], null, undefined]
        );
      });
      it("$regex", function () {
        expect(() =>
          compileDocumentSelector({
            _id: {
              $regex: /pattern/,
              $options: "foo",
            },
          })
        ).to.throw("Only the i, m, and g regexp options are supported");

        // regex instance
        const selector1 = compileDocumentSelector({ _id: { $regex: /foo/ } });
        expect(selector1({ _id: undefined })).to.equal(false);
        expect(selector1({ _id: null })).to.equal(false);
        expect(selector1({ _id: [] })).to.equal(false);
        expect(selector1({ _id: {} })).to.equal(false);
        expect(selector1({ _id: 1 })).to.equal(false);
        expect(selector1({ _id: "bar" })).to.equal(false);
        expect(selector1({ _id: "somefooval" })).to.equal(true);

        // regex string
        const selector2 = compileDocumentSelector({ _id: { $regex: "foo" } });
        expect(selector2({ _id: undefined })).to.equal(false);
        expect(selector2({ _id: null })).to.equal(false);
        expect(selector2({ _id: [] })).to.equal(false);
        expect(selector2({ _id: {} })).to.equal(false);
        expect(selector2({ _id: 1 })).to.equal(false);
        expect(selector2({ _id: "bar" })).to.equal(false);
        expect(selector2({ _id: "somefooval" })).to.equal(true);
      });
      it("$elemMatch", function () {
        // nested objects
        const selector = compileDocumentSelector({
          _id: { $elemMatch: { foo: "bar", bar: { $gt: 0 } } },
        });
        expect(selector({ _id: [{ foo: "bar", bar: 0 }] })).to.equal(false);
        expect(selector({ _id: [{ foo: "bar", bar: 1 }] })).to.equal(true);
        expect(selector({ _id: [{ foo: "baz" }] })).to.equal(false);
        expect(selector({ _id: [] })).to.equal(false);
        expect(selector({ _id: undefined })).to.equal(false);
        expect(selector({ _id: null })).to.equal(false);
        expect(selector({ _id: {} })).to.equal(false);
        expect(selector({ _id: "" })).to.equal(false);
        expect(selector({ _id: 1 })).to.equal(false);

        // TODO make $elemMatch to work with value operators
      });
      it("$not", function () {
        const selector = compileDocumentSelector({
          _id: { $not: { foo: "bar" } },
        });
        expect(selector({ _id: [{ foo: "bar" }] })).to.equal(false);
        expect(selector({ _id: [{ foo: "baz" }] })).to.equal(true);
      });
      it("$near");
      it("$geoIntersects");
    });

    describe("logical operators", function () {
      it("throws on unrecognized operator", function () {
        expect(() => compileDocumentSelector({ $foo: 2 })).to.throw(
          "Unrecognized logical operator: $foo"
        );
      });
      it("$and", function () {
        expect(() => compileDocumentSelector({ $and: 1 })).to.throw(
          "$and/$or/$nor must be nonempty array"
        );
        expect(() => compileDocumentSelector({ $and: [] })).to.throw(
          "$and/$or/$nor must be nonempty array"
        );

        const selector = compileDocumentSelector({
          $and: [{ _id: "foo" }, { foo: "bar" }],
        });

        expect(selector({})).to.equal(false);
        expect(selector({ _id: "foo" })).to.equal(false);
        expect(selector({ foo: "bar" })).to.equal(false);
        expect(selector({ _id: "foo", foo: "bar" })).to.equal(true);
      });
      it("$or", function () {
        expect(() => compileDocumentSelector({ $or: 1 })).to.throw(
          "$and/$or/$nor must be nonempty array"
        );
        expect(() => compileDocumentSelector({ $or: [] })).to.throw(
          "$and/$or/$nor must be nonempty array"
        );

        const selector = compileDocumentSelector({
          $or: [{ _id: "foo" }, { foo: "bar" }],
        });

        expect(selector({})).to.equal(false);
        expect(selector({ _id: "foo" })).to.equal(true);
        expect(selector({ foo: "bar" })).to.equal(true);
        expect(selector({ _id: "foo", foo: "bar" })).to.equal(true);
      });
      it("$nor", function () {
        expect(() => compileDocumentSelector({ $nor: 1 })).to.throw(
          "$and/$or/$nor must be nonempty array"
        );
        expect(() => compileDocumentSelector({ $nor: [] })).to.throw(
          "$and/$or/$nor must be nonempty array"
        );

        const selector = compileDocumentSelector({
          $nor: [{ _id: "foo" }, { foo: "bar" }],
        });

        expect(selector({})).to.equal(true);
        expect(selector({ _id: "foo" })).to.equal(false);
        expect(selector({ foo: "bar" })).to.equal(false);
        expect(selector({ _id: "foo", foo: "bar" })).to.equal(false);
      });
      it("$where", function () {
        const selector = compileDocumentSelector({
          $where: () => true,
        });

        expect(selector({})).to.equal(true);
        expect(selector({ _id: randomHex() })).to.equal(true);

        const selector1 = compileDocumentSelector({
          $where: true,
        });

        expect(selector1({})).to.equal(true);
        expect(selector1({ _id: randomHex() })).to.equal(true);
      });
    });
  });
});
